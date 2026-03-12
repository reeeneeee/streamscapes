import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as Tone from 'tone';
import { useStore } from '@/store';
import { AudioEngine } from '@/lib/audio-engine';
import { StreamManager } from '@/lib/stream-manager';
import { setupVisibilityHandler } from '@/lib/visibility-handler';
import { createPlugins } from '@/streams';
import { ALL_DEFAULT_CHANNELS, createOtlpChannelConfig } from '@/streams/defaults';
import type { StreamPlugin } from '@/types/stream';

/**
 * Main orchestrator hook. Initializes AudioEngine, StreamManager,
 * and connects/disconnects streams based on store state.
 */
export function useStreamscapes(lat: number, lon: number) {
  const engineRef = useRef<AudioEngine | null>(null);
  const managerRef = useRef<StreamManager | null>(null);
  const cleanupVisRef = useRef<(() => void) | null>(null);
  const initializedRef = useRef(false);

  const store = useStore;
  const isPlaying = useStore((s) => s.isPlaying);
  const channels = useStore((s) => s.channels);
  const setPlaying = useStore((s) => s.setPlaying);
  const addChannel = useStore((s) => s.addChannel);
  const pluginsRef = useRef<StreamPlugin[]>([]);
  const plugins = useMemo(() => createPlugins(lat, lon), [lat, lon]);
  pluginsRef.current = plugins;

  // Initialize engine + manager once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Seed default channels if store is empty or has stale data
    const currentChannels = store.getState().channels;
    const needsReseed = Object.keys(currentChannels).length === 0 ||
      Object.values(currentChannels).some((ch) => !ch.mode);
    if (needsReseed) {
      for (const id of Object.keys(currentChannels)) {
        store.getState().removeChannel(id);
      }
      for (const ch of ALL_DEFAULT_CHANNELS) {
        addChannel(ch);
      }
    }

    // Disable stale OTLP channels on startup — they re-enable when data arrives
    const currentChannelsForCleanup = store.getState().channels;
    for (const [id, ch] of Object.entries(currentChannelsForCleanup)) {
      if (ch.parentPluginId && ch.enabled) {
        store.getState().updateChannel(id, { enabled: false });
      }
    }

    const engine = new AudioEngine(store);

    // Maximum number of auto-created sub-channels (OTLP + Datadog combined)
    const MAX_SUB_CHANNELS = 12;

    // Register callback for auto-creating channels from multiplexed plugins
    engine.onUnknownStreamId = (streamId: string) => {
      const colonIdx = streamId.indexOf(':');
      if (colonIdx < 1) return; // no prefix — ignore

      const existingCh = store.getState().channels[streamId];
      if (existingCh) return;

      const subCount = Object.values(store.getState().channels)
        .filter((ch) => ch.parentPluginId).length;
      if (subCount >= MAX_SUB_CHANNELS) return;

      const serviceName = streamId.slice(colonIdx + 1);
      const cfg = createOtlpChannelConfig(serviceName);
      store.getState().addChannel({ ...cfg, streamId });
    };

    const plugins = pluginsRef.current;
    const { setStreamState } = store.getState();
    const manager = new StreamManager({ setStreamState }, engine, plugins);

    engineRef.current = engine;
    managerRef.current = manager;
    cleanupVisRef.current = setupVisibilityHandler();

    // Resume audio + reconnect streams when page becomes visible
    const handleResume = async () => {
      if (document.hidden || !useStore.getState().isPlaying) return;
      try {
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext;
        await ctx.resume();
        engine.start();
        const channels = useStore.getState().channels;
        const activeStreams = useStore.getState().activeStreams;
        for (const [streamId, config] of Object.entries(channels)) {
          if (config.parentPluginId) continue;
          if (config.enabled && !activeStreams[streamId]) {
            manager.connectStream(streamId);
          }
        }
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      manager.dispose();
      engine.dispose();
      cleanupVisRef.current?.();
      initializedRef.current = false;
    };
  }, [lat, lon]);

  // Connect/disconnect streams when channel enabled state changes
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isPlaying) return;

    for (const [streamId, config] of Object.entries(channels)) {
      // Sub-channels (e.g. otlp:synapse) are fed by their parent plugin's connection
      if (config.parentPluginId) continue;
      const streamState = useStore.getState().activeStreams[streamId];
      if (config.enabled && !streamState) {
        manager.connectStream(streamId);
      } else if (!config.enabled && streamState) {
        manager.disconnectStream(streamId);
      }
    }
  }, [channels, isPlaying]);

  const startAudio = useCallback(() => {
    if (useStore.getState().isPlaying) return;
    // Synchronous — must be in user gesture for AudioContext
    Tone.start();
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    if (rawCtx.state !== 'running') rawCtx.resume();
    setPlaying(true);
    engineRef.current?.start();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Streamscapes',
        artist: 'Real-time data sonification',
      });
    }
  }, []);

  const stopAudio = useCallback(() => {
    setPlaying(false);
    managerRef.current?.dispose();
    engineRef.current?.dispose();
    cleanupVisRef.current?.();
    engineRef.current = null;
    managerRef.current = null;
    cleanupVisRef.current = null;
    initializedRef.current = false;
  }, []);

  return {
    engine: engineRef.current,
    manager: managerRef.current,
    plugins,
    startAudio,
    stopAudio,
    isPlaying,
  };
}
