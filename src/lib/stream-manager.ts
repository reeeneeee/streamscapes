import type { StreamPlugin } from '@/types/stream';
import type { AudioEngine } from './audio-engine';

export interface StreamManagerStore {
  setStreamState(streamId: string, state: { status: string; error?: string } | null): void;
}

export class StreamManager {
  private plugins: Map<string, StreamPlugin> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private store: StreamManagerStore;
  private audioEngine: AudioEngine;

  constructor(
    store: StreamManagerStore,
    audioEngine: AudioEngine,
    plugins: StreamPlugin[]
  ) {
    this.store = store;
    this.audioEngine = audioEngine;
    for (const plugin of plugins) {
      this.plugins.set(plugin.id, plugin);
    }
  }

  async connectStream(streamId: string) {
    const plugin = this.plugins.get(streamId);
    if (!plugin) return;

    // Disconnect if already running
    this.disconnectStream(streamId);

    const controller = new AbortController();
    this.abortControllers.set(streamId, controller);

    this.store.setStreamState(streamId, { status: 'connecting' });

    try {
      const iterable = plugin.connect(controller.signal);
      this.store.setStreamState(streamId, { status: 'connected' });

      for await (const dataPoint of iterable) {
        if (controller.signal.aborted) break;
        this.audioEngine.handleDataPoint(dataPoint);
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.store.setStreamState(streamId, { status: 'error', error: message });
    }
  }

  disconnectStream(streamId: string) {
    const controller = this.abortControllers.get(streamId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(streamId);
    }
    this.store.setStreamState(streamId, null);
  }

  getAvailablePlugins(): StreamPlugin[] {
    return Array.from(this.plugins.values());
  }

  dispose() {
    for (const [id] of this.abortControllers) {
      this.disconnectStream(id);
    }
  }
}
