/**
 * Streamscapes System Monitor — Service Worker
 *
 * Polls battery, CPU, memory and listens to tab/download events.
 * POSTs OTLP-formatted spans to the Streamscapes ingest endpoint.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULTS = {
  targetUrl: 'https://www.streamscapes.fm',
  apiKey: '',
  enableTabs: true,
  enableDownloads: true,
  tabDomains: '',
  tabFilterMode: 'include',
};

let config = { ...DEFAULTS };

async function loadConfig() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  config = { ...DEFAULTS, ...stored };
}

chrome.storage.onChanged.addListener(() => loadConfig());

// ---------------------------------------------------------------------------
// OTLP span construction (mirrors scripts/notif-poller.ts)
// ---------------------------------------------------------------------------

function makeOtlpPayload(serviceName, spanName, fields) {
  const now = Date.now();
  const startNano = String(now * 1_000_000);
  const endNano = String((now + 1) * 1_000_000);

  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
        ],
      },
      scopeSpans: [{
        spans: [{
          name: spanName,
          kind: 0,
          startTimeUnixNano: startNano,
          endTimeUnixNano: endNano,
          status: { code: 1 },
          attributes: Object.entries(fields).map(([key, val]) => ({
            key,
            value: typeof val === 'number'
              ? { intValue: Math.round(val) }
              : { stringValue: String(val) },
          })),
        }],
      }],
    }],
  };
}

async function postSpan(serviceName, spanName, fields) {
  if (!config.apiKey) return;
  const url = `${config.targetUrl}/api/ingest/otlp/v1/traces?source=browser`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Agent-Version': chrome.runtime.getManifest().version,
      },
      body: JSON.stringify(makeOtlpPayload(serviceName, spanName, fields)),
    });
    if (res.ok) {
      chrome.storage.local.set({ lastPostOk: Date.now(), lastPostError: null });
    } else {
      console.warn(`[ss] POST failed: ${res.status}`);
      const hint = res.status === 401 ? 'Invalid API key — check your key in the Inputs tab on streamscapes'
        : res.status === 404 ? 'Endpoint not found — check your Streamscapes URL'
        : res.status >= 500 ? 'Server error — streamscapes may be down'
        : `HTTP ${res.status}`;
      chrome.storage.local.set({ lastPostError: hint });
    }
  } catch (err) {
    console.warn('[ss] POST error:', err);
    const hint = err.message.includes('Failed to fetch')
      ? 'Cannot reach server — check your Streamscapes URL'
      : err.message;
    chrome.storage.local.set({ lastPostError: hint });
  }
}

// ---------------------------------------------------------------------------
// Debounce — skip if value unchanged since last POST
// ---------------------------------------------------------------------------

const lastValues = new Map();

function hasChanged(key, value) {
  const prev = lastValues.get(key);
  if (prev === value) return false;
  lastValues.set(key, value);
  return true;
}

// System signals (battery, CPU, memory) moved to the Streamscapes Agent menubar app

// ---------------------------------------------------------------------------
// Signal: Tabs (event-driven) — per-domain sub-channels
// ---------------------------------------------------------------------------

function hostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/** Strip leading "www." for cleaner channel names */
function cleanHost(host) {
  return host.replace(/^www\./, '') || '';
}

/** Parse the comma-separated tabDomains config into a Set of cleaned hostnames */
function getTrackedDomains() {
  const raw = config.tabDomains || '';
  const set = new Set();
  for (const d of raw.split(',')) {
    const trimmed = d.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

/** Check whether a host matches any domain in the set (exact or subdomain) */
function matchesDomainSet(host, domainSet) {
  for (const domain of domainSet) {
    if (host === domain || host.endsWith('.' + domain)) return true;
  }
  return false;
}

/**
 * Returns the service name(s) for a tab event.
 * - Always includes "[all]" for the aggregate channel
 * - If tabDomains is empty → also includes the tab's hostname (every domain gets its own channel)
 * - If tabDomains is populated:
 *   - 'include' mode → only listed domains get their own channel
 *   - 'exclude' mode → all domains EXCEPT listed ones get their own channel
 */
function isInternalUrl(url) {
  return /^(chrome|chrome-extension|about|edge|brave|devtools):/.test(url);
}

function tabServiceNames(url) {
  if (isInternalUrl(url)) return [];
  const host = cleanHost(hostname(url));
  const names = [];
  if (!host) return names;

  const tracked = getTrackedDomains();

  // Empty filter = every domain gets its own channel
  if (tracked.size === 0) {
    names.push(host);
    return names;
  }

  const matches = matchesDomainSet(host, tracked);
  const mode = config.tabFilterMode || 'include';

  if (mode === 'exclude') {
    if (!matches) names.push(host);
  } else {
    if (matches) names.push(host);
  }
  return names;
}

async function getTabCount() {
  const tabs = await chrome.tabs.query({});
  return tabs.length;
}

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!config.enableTabs) return;
  const url = tab.pendingUrl || tab.url || '';
  if (isInternalUrl(url)) return;
  const tabCount = await getTabCount();
  const host = cleanHost(hostname(url));
  const domains = tabServiceNames(url);
  for (const domain of domains) {
    await postSpan(domain, 'tab.opened', { tabCount, url: host });
  }
});

chrome.tabs.onRemoved.addListener(async () => {
  if (!config.enableTabs) return;
  // No URL available on remove — skip (tab.closed doesn't map to a domain)
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!config.enableTabs) return;
  const tab = await chrome.tabs.get(activeInfo.tabId);
  const url = tab.url || '';
  if (isInternalUrl(url)) return;
  const tabCount = await getTabCount();
  const host = cleanHost(hostname(url));
  const domains = tabServiceNames(url);
  for (const domain of domains) {
    await postSpan(domain, 'tab.switched', { tabCount, url: host });
  }
});

// ---------------------------------------------------------------------------
// Signal: Downloads (event-driven)
// ---------------------------------------------------------------------------

if (config.enableDownloads !== false) {
  chrome.downloads.onCreated.addListener(async (item) => {
    if (!config.enableDownloads) return;
    await postSpan('downloads', 'download.started', {
      fileSize: item.fileSize || 0,
      mimeType: item.mime || 'unknown',
    });
  });

  chrome.downloads.onChanged.addListener(async (delta) => {
    if (!config.enableDownloads) return;
    if (delta.state) {
      const spanName = delta.state.current === 'complete' ? 'complete' : 'failed';
      if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
        await postSpan('downloads', `download.${spanName}`, {});
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadConfig();
