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
  enableBattery: true,
  enableCpu: true,
  enableMemory: true,
  enableTabs: true,
  enableDownloads: true,
  // Comma-separated hostnames to track as individual channels (empty = [all] only)
  tabDomains: '',
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
      },
      body: JSON.stringify(makeOtlpPayload(serviceName, spanName, fields)),
    });
    if (res.ok) {
      chrome.storage.local.set({ lastPostOk: Date.now() });
    } else {
      console.warn(`[ss] POST failed: ${res.status}`);
      chrome.storage.local.set({ lastPostError: `${res.status} at ${new Date().toISOString()}` });
    }
  } catch (err) {
    console.warn('[ss] POST error:', err);
    chrome.storage.local.set({ lastPostError: `${err.message} at ${new Date().toISOString()}` });
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

// ---------------------------------------------------------------------------
// Signal: Battery (30s alarm)
// ---------------------------------------------------------------------------

async function pollBattery() {
  if (!config.enableBattery) return;
  try {
    const battery = await navigator.getBattery();
    const level = Math.round(battery.level * 100);
    const charging = battery.charging ? 1 : 0;
    if (!hasChanged('battery', `${level}:${charging}`)) return;
    await postSpan('battery', 'level', { level, charging });
  } catch (err) {
    console.warn('[ss] Battery API unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Signal: CPU (10s alarm)
// ---------------------------------------------------------------------------

async function pollCpu() {
  if (!config.enableCpu) return;
  try {
    const info = await chrome.system.cpu.getInfo();
    let totalUser = 0, totalTotal = 0;
    for (const p of info.processors) {
      totalUser += p.usage.user;
      totalTotal += p.usage.total;
    }
    const usagePercent = totalTotal > 0 ? Math.round((totalUser / totalTotal) * 100) : 0;
    if (!hasChanged('cpu', usagePercent)) return;
    await postSpan('cpu', 'usage', { usagePercent });
  } catch (err) {
    console.warn('[ss] CPU API error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Signal: Memory (30s alarm)
// ---------------------------------------------------------------------------

async function pollMemory() {
  if (!config.enableMemory) return;
  try {
    const info = await chrome.system.memory.getInfo();
    const totalMB = Math.round(info.capacity / (1024 * 1024));
    const availableMB = Math.round(info.availableCapacity / (1024 * 1024));
    const usedPercent = Math.round(((totalMB - availableMB) / totalMB) * 100);
    if (!hasChanged('memory', usedPercent)) return;
    await postSpan('memory', 'pressure', { usedPercent, availableMB });
  } catch (err) {
    console.warn('[ss] Memory API error:', err.message);
  }
}

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

/**
 * Returns the service name(s) for a tab event.
 * - Always includes "[all]" for the aggregate channel
 * - If tabDomains is empty → also includes the tab's hostname (every domain gets its own channel)
 * - If tabDomains is populated → only includes hostnames that match the filter
 */
function tabServiceNames(url) {
  const host = cleanHost(hostname(url));
  const names = ['[all]'];
  if (!host) return names;

  const tracked = getTrackedDomains();

  // Empty filter = every domain gets its own channel
  if (tracked.size === 0) {
    names.push(host);
    return names;
  }

  // Populated filter = only matching domains
  for (const domain of tracked) {
    if (host === domain || host.endsWith('.' + domain)) {
      names.push(domain);
      break;
    }
  }
  return names;
}

async function getTabCount() {
  const tabs = await chrome.tabs.query({});
  return tabs.length;
}

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!config.enableTabs) return;
  const tabCount = await getTabCount();
  const url = tab.pendingUrl || tab.url || '';
  for (const svc of tabServiceNames(url)) {
    await postSpan(svc, 'opened', { tabCount, url: cleanHost(hostname(url)) });
  }
});

chrome.tabs.onRemoved.addListener(async () => {
  if (!config.enableTabs) return;
  const tabCount = await getTabCount();
  // Closed tabs don't carry a URL — only fire on [all]
  await postSpan('[all]', 'closed', { tabCount });
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!config.enableTabs) return;
  const tab = await chrome.tabs.get(activeInfo.tabId);
  const tabCount = await getTabCount();
  const url = tab.url || '';
  for (const svc of tabServiceNames(url)) {
    await postSpan(svc, 'switched', { tabCount, url: cleanHost(hostname(url)) });
  }
});

// ---------------------------------------------------------------------------
// Signal: Downloads (event-driven)
// ---------------------------------------------------------------------------

if (config.enableDownloads !== false) {
  chrome.downloads.onCreated.addListener(async (item) => {
    if (!config.enableDownloads) return;
    await postSpan('downloads', 'started', {
      fileSize: item.fileSize || 0,
      mimeType: item.mime || 'unknown',
    });
  });

  chrome.downloads.onChanged.addListener(async (delta) => {
    if (!config.enableDownloads) return;
    if (delta.state) {
      const spanName = delta.state.current === 'complete' ? 'complete' : 'failed';
      if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
        await postSpan('downloads', spanName, {});
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Alarm scheduling
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'battery') pollBattery();
  if (alarm.name === 'cpu') pollCpu();
  if (alarm.name === 'memory') pollMemory();
});

async function setupAlarms() {
  await chrome.alarms.clearAll();
  // chrome.alarms minimum period is 1 minute in production, but
  // periodInMinutes < 1 is clamped to 1 in release builds.
  // For CPU we want 10s ideally — alarm fires every minute, but
  // we accept that as the MV3 minimum.
  chrome.alarms.create('battery', { periodInMinutes: 0.5 });
  chrome.alarms.create('cpu', { periodInMinutes: 0.5 });
  chrome.alarms.create('memory', { periodInMinutes: 0.5 });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadConfig().then(() => {
  setupAlarms();
  // Fire initial polls
  pollBattery();
  pollCpu();
  pollMemory();
});
