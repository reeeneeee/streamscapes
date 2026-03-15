import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  loadConfig: () => Promise<PublicConfig>;
  saveConfig: (config: PublicConfig) => Promise<void>;
  startAgent: () => Promise<void>;
  stopAgent: () => Promise<void>;
  getStatus: () => Promise<AgentStatus>;
  openFdaSettings: () => Promise<void>;
  onStatusUpdate: (callback: (status: AgentStatus) => void) => void;
}

export interface PublicConfig {
  endpoint: string;
  apiKey: string;
  enableNotif: boolean;
  enableDd: boolean;
  ddApiKey: string;
  ddAppKey: string;
  ddSite: string;
  launchAtLogin: boolean;
}

export interface AgentStatus {
  state: 'idle' | 'running' | 'error';
  spanCount?: number;
  error?: string;
  fdaRequired?: boolean;
}

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config: PublicConfig) => ipcRenderer.invoke('save-config', config),
  startAgent: () => ipcRenderer.invoke('start-agent'),
  stopAgent: () => ipcRenderer.invoke('stop-agent'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  openFdaSettings: () => ipcRenderer.invoke('open-fda-settings'),
  onStatusUpdate: (callback: (status: AgentStatus) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },
} satisfies ElectronAPI);
