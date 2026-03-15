declare global {
  interface Window {
    api: {
      loadConfig: () => Promise<Config>;
      saveConfig: (config: Config) => Promise<void>;
      startAgent: () => Promise<void>;
      stopAgent: () => Promise<void>;
      getStatus: () => Promise<Status>;
      openFdaSettings: () => Promise<void>;
      onStatusUpdate: (callback: (status: Status) => void) => void;
    };
  }
}

interface Config {
  endpoint: string;
  apiKey: string;
  enableNotif: boolean;
  enableDd: boolean;
  ddApiKey: string;
  ddAppKey: string;
  ddSite: string;
  launchAtLogin: boolean;
}

interface Status {
  state: 'idle' | 'running' | 'error';
  spanCount?: number;
  error?: string;
  fdaRequired?: boolean;
}

const $ = (id: string) => document.getElementById(id)!;

// ---------------------------------------------------------------------------
// Config ↔ UI
// ---------------------------------------------------------------------------

function configToUI(cfg: Config) {
  (($('endpoint') as HTMLInputElement)).value = cfg.endpoint;
  (($('apiKey') as HTMLInputElement)).value = cfg.apiKey;
  (($('enableNotif') as HTMLInputElement)).checked = cfg.enableNotif;
  (($('enableDd') as HTMLInputElement)).checked = cfg.enableDd;
  (($('ddApiKey') as HTMLInputElement)).value = cfg.ddApiKey;
  (($('ddAppKey') as HTMLInputElement)).value = cfg.ddAppKey;
  (($('ddSite') as HTMLInputElement)).value = cfg.ddSite;
  updateDdVisibility();
}

function uiToConfig(): Config {
  return {
    endpoint: (($('endpoint') as HTMLInputElement)).value.trim() || 'https://www.streamscapes.fm',
    apiKey: (($('apiKey') as HTMLInputElement)).value.trim(),
    enableNotif: (($('enableNotif') as HTMLInputElement)).checked,
    enableDd: (($('enableDd') as HTMLInputElement)).checked,
    ddApiKey: (($('ddApiKey') as HTMLInputElement)).value.trim(),
    ddAppKey: (($('ddAppKey') as HTMLInputElement)).value.trim(),
    ddSite: (($('ddSite') as HTMLInputElement)).value.trim() || 'datadoghq.com',
    launchAtLogin: false, // managed via context menu
  };
}

function updateDdVisibility() {
  $('ddConfig').style.display = ($('enableDd') as HTMLInputElement).checked ? 'block' : 'none';
}

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

function updateStatus(status: Status) {
  const el = $('status');
  const fda = $('fdaWarning');

  if (status.state === 'running') {
    const count = status.spanCount ?? 0;
    el.textContent = `Running — ${count} span${count === 1 ? '' : 's'} sent`;
    el.className = 'ok';
  } else if (status.state === 'error') {
    el.textContent = status.error ?? 'Error';
    el.className = 'err';
  } else {
    el.textContent = 'Stopped';
    el.className = '';
  }

  // FDA warning
  fda.style.display = status.fdaRequired ? 'block' : 'none';

  // Update buttons
  const isRunning = status.state === 'running';
  ($('startBtn') as HTMLButtonElement).disabled = isRunning;
  ($('stopBtn') as HTMLButtonElement).disabled = !isRunning;
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

$('enableDd').addEventListener('change', updateDdVisibility);

$('startBtn').addEventListener('click', async () => {
  // Auto-save before starting
  await window.api.saveConfig(uiToConfig());
  await window.api.startAgent();
});

$('stopBtn').addEventListener('click', async () => {
  await window.api.stopAgent();
});

$('saveBtn').addEventListener('click', async () => {
  await window.api.saveConfig(uiToConfig());
  const msg = $('savedMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 1500);
});

$('fdaBtn').addEventListener('click', () => {
  window.api.openFdaSettings();
});

// Subscribe to status updates from main process
window.api.onStatusUpdate(updateStatus);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async () => {
  const [cfg, status] = await Promise.all([
    window.api.loadConfig(),
    window.api.getStatus(),
  ]);
  configToUI(cfg);
  updateStatus(status);
})();
