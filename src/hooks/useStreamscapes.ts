import { useEffect, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { useStore } from '@/store';
import { AudioEngine } from '@/lib/audio-engine';
import { StreamManager } from '@/lib/stream-manager';
import { setupVisibilityHandler } from '@/lib/visibility-handler';
import { createPlugins } from '@/streams';
import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';
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

    // Seed default channels if store is empty or has stale data (missing mode)
    const currentChannels = store.getState().channels;
    const needsReseed = Object.keys(currentChannels).length === 0 ||
      Object.values(currentChannels).some((ch) => !ch.mode);
    if (needsReseed) {
      // Clear stale channels
      for (const id of Object.keys(currentChannels)) {
        store.getState().removeChannel(id);
      }
      for (const ch of ALL_DEFAULT_CHANNELS) {
        addChannel(ch);
      }
    }

    const engine = new AudioEngine(store);
    const plugins = pluginsRef.current;
    // StreamManager needs setStreamState — get it from the store
    const { setStreamState } = store.getState();
    const manager = new StreamManager({ setStreamState }, engine, plugins);

    engineRef.current = engine;
    managerRef.current = manager;
    cleanupVisRef.current = setupVisibilityHandler();

    const resumeIfPlaying = async () => {
      if (!useStore.getState().isPlaying) return;
      try {
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext;
        await ctx.resume();
        engine.start();
        const channels = useStore.getState().channels;
        const activeStreams = useStore.getState().activeStreams;
        for (const [streamId, config] of Object.entries(channels)) {
          if (config.enabled && !activeStreams[streamId]) {
            manager.connectStream(streamId);
          }
        }
      } catch {
        // no-op; will retry on visibility/user gesture
      }
    };
    void resumeIfPlaying();

    // Resume audio + reconnect streams when page becomes visible again
    const handleResume = async () => {
      if (document.hidden || !useStore.getState().isPlaying) return;
      try {
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext;
        await ctx.resume();
        engine.start();
        // Reconnect any dropped streams
        const channels = useStore.getState().channels;
        const activeStreams = useStore.getState().activeStreams;
        for (const [streamId, config] of Object.entries(channels)) {
          if (config.enabled && !activeStreams[streamId]) {
            manager.connectStream(streamId);
          }
        }
      } catch (e) { /* ignore */ }
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
      const streamState = useStore.getState().activeStreams[streamId];
      if (config.enabled && !streamState) {
        manager.connectStream(streamId);
      } else if (!config.enabled && streamState) {
        manager.disconnectStream(streamId);
      }
    }
  }, [channels, isPlaying]);

  const startAudio = async () => {
    if (useStore.getState().isPlaying) return;
    // Must call synchronously within user gesture for iOS Safari
    Tone.start();
    // Also poke the raw AudioContext directly
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    if (rawCtx.state !== 'running') rawCtx.resume();
    setPlaying(true);
    engineRef.current?.start();

    // Register with Media Session API for background audio
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Streamscapes',
        artist: 'Real-time data sonification',
      });
    }
  };

  const stopAudio = () => {
    setPlaying(false);
    const manager = managerRef.current;
    if (manager) {
      manager.dispose();
    }
    engineRef.current?.dispose();
    cleanupVisRef.current?.();
    engineRef.current = null;
    managerRef.current = null;
    cleanupVisRef.current = null;
    initializedRef.current = false;
  };

  return {
    engine: engineRef.current,
    manager: managerRef.current,
    plugins,
    startAudio,
    stopAudio,
    isPlaying,
  };
}
