const FIELDS = ['targetUrl', 'apiKey', 'enableBattery', 'enableCpu', 'enableMemory', 'enableTabs', 'enableDownloads', 'tabDomains'];
const DEFAULTS = {
  targetUrl: 'https://www.streamscapes.fm',
  apiKey: '',
  enableBattery: true,
  enableCpu: true,
  enableMemory: true,
  enableTabs: true,
  enableDownloads: true,
  tabDomains: '',
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
    if (items.lastPostOk) {
      const ago = Math.round((Date.now() - items.lastPostOk) / 1000);
      el.textContent = `Last POST: ${ago}s ago`;
      el.className = 'ok';
    } else if (items.lastPostError) {
      el.textContent = `Error: ${items.lastPostError}`;
      el.className = 'err';
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

// Save
$('save').addEventListener('click', () => {
  const values = {};
  for (const key of FIELDS) {
    const el = $(key);
    values[key] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  chrome.storage.sync.set(values, () => {
    const el = $('status');
    el.textContent = 'Saved';
    el.className = 'ok';
    setTimeout(updateStatus, 2000);
  });
});

