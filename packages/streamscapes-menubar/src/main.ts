import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  shell,
  powerMonitor,
  safeStorage,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createAgent, type AgentConfig, type AgentStatus } from './agent';

// ---------------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

interface StoredConfig {
  endpoint: string;
  apiKey_enc?: string; // safeStorage-encrypted, base64
  apiKey_plain?: string; // fallback when safeStorage unavailable
  enableNotif: boolean;
  enableDd: boolean;
  ddApiKey_enc?: string;
  ddApiKey_plain?: string;
  ddAppKey_enc?: string;
  ddAppKey_plain?: string;
  ddSite: string;
  launchAtLogin: boolean;
}

const DEFAULTS: StoredConfig = {
  endpoint: 'https://www.streamscapes.fm',
  enableNotif: true,
  enableDd: false,
  ddSite: 'datadoghq.com',
  launchAtLogin: false,
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig(): StoredConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg: StoredConfig): void {
  const dir = path.dirname(configPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function encryptSecret(value: string): { enc?: string; plain?: string } {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: safeStorage.encryptString(value).toString('base64') };
  }
  return { plain: value };
}

function decryptSecret(enc?: string, plain?: string): string {
  if (enc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return '';
    }
  }
  return plain ?? '';
}

// Public config shape sent to the renderer (secrets decrypted)
interface PublicConfig {
  endpoint: string;
  apiKey: string;
  enableNotif: boolean;
  enableDd: boolean;
  ddApiKey: string;
  ddAppKey: string;
  ddSite: string;
  launchAtLogin: boolean;
}

function toPublicConfig(cfg: StoredConfig): PublicConfig {
  return {
    endpoint: cfg.endpoint,
    apiKey: decryptSecret(cfg.apiKey_enc, cfg.apiKey_plain),
    enableNotif: cfg.enableNotif,
    enableDd: cfg.enableDd,
    ddApiKey: decryptSecret(cfg.ddApiKey_enc, cfg.ddApiKey_plain),
    ddAppKey: decryptSecret(cfg.ddAppKey_enc, cfg.ddAppKey_plain),
    ddSite: cfg.ddSite,
    launchAtLogin: cfg.launchAtLogin,
  };
}

function fromPublicConfig(pub: PublicConfig): StoredConfig {
  const apiKey = encryptSecret(pub.apiKey);
  const ddApiKey = encryptSecret(pub.ddApiKey);
  const ddAppKey = encryptSecret(pub.ddAppKey);
  return {
    endpoint: pub.endpoint,
    apiKey_enc: apiKey.enc,
    apiKey_plain: apiKey.plain,
    enableNotif: pub.enableNotif,
    enableDd: pub.enableDd,
    ddApiKey_enc: ddApiKey.enc,
    ddApiKey_plain: ddApiKey.plain,
    ddAppKey_enc: ddAppKey.enc,
    ddAppKey_plain: ddAppKey.plain,
    ddSite: pub.ddSite,
    launchAtLogin: pub.launchAtLogin,
  };
}

// ---------------------------------------------------------------------------
// Agent state
// ---------------------------------------------------------------------------

let agentHandle: ReturnType<typeof createAgent> | null = null;
let agentStatus: AgentStatus = { state: 'idle', spanCount: 0 };

function pushStatus(win: BrowserWindow | null) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('status-update', agentStatus);
  }
}

function startAgentFromConfig(win: BrowserWindow | null) {
  if (agentHandle?.isRunning()) return;

  const pub = toPublicConfig(loadConfig());
  if (!pub.apiKey) {
    agentStatus = { state: 'error', spanCount: agentStatus.spanCount, error: 'API key required' };
    pushStatus(win);
    return;
  }

  const endpoint = pub.endpoint.replace(/\/$/, '') + '/api/ingest/otlp/v1/traces';

  const config: AgentConfig = {
    endpoint,
    apiKey: pub.apiKey,
    enableNotif: pub.enableNotif,
    enableDd: pub.enableDd,
    ddApiKey: pub.ddApiKey || undefined,
    ddAppKey: pub.ddAppKey || undefined,
    ddSite: pub.ddSite || undefined,
  };

  agentStatus = { state: 'running', spanCount: 0 };
  pushStatus(win);

  agentHandle = createAgent(config, {
    onLog(_mod, _msg) {
      // Future: forward to renderer log view
    },
    onSpanSent(_mod, _svc) {
      agentStatus.spanCount = (agentStatus.spanCount ?? 0) + 1;
      pushStatus(win);
    },
    onError(_mod, error) {
      agentStatus = { state: 'error', spanCount: agentStatus.spanCount, error };
      pushStatus(win);
    },
    onFdaRequired() {
      agentStatus = {
        state: 'running',
        spanCount: agentStatus.spanCount,
        fdaRequired: true,
      };
      pushStatus(win);
    },
  });

  agentHandle.start();
}

function stopAgent(win: BrowserWindow | null) {
  if (agentHandle) {
    agentHandle.stop();
    agentHandle = null;
  }
  agentStatus = { state: 'idle', spanCount: agentStatus.spanCount };
  pushStatus(win);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

function getWindowPosition(): { x: number; y: number } {
  const trayBounds = tray!.getBounds();
  const winBounds = win!.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  return { x, y };
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
    win.show();
    win.focus();
  }
}

function buildContextMenu(): Menu {
  const isRunning = agentHandle?.isRunning() ?? false;
  const cfg = loadConfig();

  return Menu.buildFromTemplate([
    {
      label: isRunning ? 'Stop Agent' : 'Start Agent',
      click: () => {
        if (isRunning) stopAgent(win);
        else startAgentFromConfig(win);
        // Rebuild menu to reflect new state
        tray?.setContextMenu(buildContextMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: cfg.launchAtLogin,
      click: (item) => {
        const updated = loadConfig();
        updated.launchAtLogin = item.checked;
        saveConfig(updated);
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Streamscapes Agent',
      click: () => {
        stopAgent(win);
        app.quit();
      },
    },
  ]);
}

app.on('window-all-closed', () => {
  // Menubar app — don't quit when window closes
});

app.whenReady().then(() => {
  // Hide dock icon
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  // Create tray
  const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('Streamscapes Agent');
  tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', () => toggleWindow());
  tray.on('right-click', () => {
    tray?.setContextMenu(buildContextMenu());
    tray?.popUpContextMenu();
  });

  // Create popover window
  win = new BrowserWindow({
    width: 340,
    height: 520,
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => win?.hide());

  // Focus existing window on second instance
  app.on('second-instance', () => {
    if (win) toggleWindow();
  });

  // IPC handlers
  ipcMain.handle('load-config', () => toPublicConfig(loadConfig()));

  ipcMain.handle('save-config', (_e, pub: PublicConfig) => {
    saveConfig(fromPublicConfig(pub));
    if (pub.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: pub.launchAtLogin });
    }
  });

  ipcMain.handle('start-agent', () => {
    startAgentFromConfig(win);
  });

  ipcMain.handle('stop-agent', () => {
    stopAgent(win);
  });

  ipcMain.handle('get-status', () => agentStatus);

  ipcMain.handle('open-fda-settings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  });

  // Sleep/wake handling
  powerMonitor.on('resume', () => {
    if (agentHandle?.isRunning()) {
      agentHandle.resetAfterWake();
    }
  });

  // Apply login item setting from saved config
  const cfg = loadConfig();
  if (cfg.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
});
