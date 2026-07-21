const FIELDS = ['targetUrl', 'apiKey', 'enableTabs', 'enableDownloads', 'tabDomains', 'tabFilterMode'];
const DEFAULTS = {
  targetUrl: 'https://www.streamscapes.fm',
  apiKey: '',
  enableTabs: true,
  enableDownloads: true,
  tabDomains: '',
  tabFilterMode: 'include',
};

const $ = (id) => document.getElementById(id);

// Load saved config
chrome.storage.sync.get(DEFAULTS, (items) => {
  for (const key of FIELDS) {
    const el = $(key);
    if (el.type === 'checkbox') {
      el.checked = items[key];
    } else {
      el.value = items[key];
    }
  }
});

// Show last POST status
function updateStatus() {
  chrome.storage.local.get(['lastPostOk', 'lastPostError'], (items) => {
    const el = $('status');
    if (items.lastPostError) {
      el.textContent = items.lastPostError;
      el.className = 'err';
    } else if (items.lastPostOk) {
      const ago = Math.round((Date.now() - items.lastPostOk) / 1000);
      el.textContent = `Connected — last sent ${ago}s ago`;
      el.className = 'ok';
    } else {
      el.textContent = 'No data sent yet';
      el.className = '';
    }
  });
}

updateStatus();
setInterval(updateStatus, 5000);

// Toggle tab domains visibility based on tabs checkbox
function updateTabDomainsVisibility() {
  const tabsEnabled = $('enableTabs').checked;
  $('tabDomainsConfig').style.display = tabsEnabled ? 'block' : 'none';
}
$('enableTabs').addEventListener('change', updateTabDomainsVisibility);
// Run once on load (after config loads, see below)
setTimeout(updateTabDomainsVisibility, 50);

// Filter mode toggle (include / exclude)
function setFilterMode(mode) {
  $('tabFilterMode').value = mode;
  $('filterInclude').classList.toggle('active', mode === 'include');
  $('filterExclude').classList.toggle('active', mode === 'exclude');
  $('filterHint').textContent = mode === 'include'
    ? 'Leave empty to create a channel for every domain. Add domains to filter to only those.'
    : 'Listed domains will be excluded — all other domains get their own channel.';
}
$('filterInclude').addEventListener('click', () => setFilterMode('include'));
$('filterExclude').addEventListener('click', () => setFilterMode('exclude'));
// Sync toggle state after config loads
setTimeout(() => setFilterMode($('tabFilterMode').value || 'include'), 60);

// Save — validate API key immediately
$('save').addEventListener('click', async () => {
  const values = {};
  for (const key of FIELDS) {
    const el = $(key);
    values[key] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }

  const statusEl = $('status');
  const url = values.targetUrl.replace(/\/+$/, '');
  const apiKey = values.apiKey;

  // Validate API key if both URL and key are provided
  if (url && apiKey) {
    statusEl.textContent = 'Verifying API key...';
    statusEl.className = '';
    try {
      const res = await fetch(`${url}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Agent-Version': chrome.runtime.getManifest().version,
        },
      });
      const updateUrl = res.headers.get('X-Agent-Update');
      if (updateUrl) {
        statusEl.textContent = 'Connected — update available';
        statusEl.className = 'ok';
      }
      if (!res.ok) {
        statusEl.textContent = 'Invalid API key — check the Inputs tab on streamscapes';
        statusEl.className = 'err';
        // Still save so the URL is persisted
        chrome.storage.sync.set(values);
        return;
      }
    } catch {
      statusEl.textContent = 'Cannot reach server — check your Streamscapes URL';
      statusEl.className = 'err';
      chrome.storage.sync.set(values);
      return;
    }
  }

  chrome.storage.sync.set(values, () => {
    // Clear any previous errors on successful save + verify
    chrome.storage.local.remove('lastPostError');
    statusEl.textContent = url && apiKey ? 'Saved — API key verified' : 'Saved';
    statusEl.className = 'ok';
    setTimeout(updateStatus, 3000);
  });
});

