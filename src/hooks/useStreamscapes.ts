import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as Tone from 'tone';
import { useStore } from '@/store';
import { AudioEngine } from '@/lib/audio-engine';
import { StreamManager } from '@/lib/stream-manager';
import { setupVisibilityHandler } from '@/lib/visibility-handler';
import { createPlugins } from '@/streams';
import { ALL_DEFAULT_CHANNELS, createOtlpChannelConfig, createBrowserChannelConfig, createSystemChannelConfig, createWatchChannelConfig } from '@/streams/defaults';
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
  // Bump this to force a re-render after engine creation so components get the ref
  const [, setTick] = useState(0);

  const store = useStore;
  const isPlaying = useStore((s) => s.isPlaying);
  const channels = useStore((s) => s.channels);
  const setPlaying = useStore((s) => s.setPlaying);
  const addChannel = useStore((s) => s.addChannel);
  const pluginsRef = useRef<StreamPlugin[]>([]);
  const plugins = useMemo(() => createPlugins(lat, lon), [lat, lon]);
  pluginsRef.current = plugins;

  // Initialize engine + manager when isPlaying becomes true
  useEffect(() => {
    if (!isPlaying) return;
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

    const engine = new AudioEngine(store);

    // Maximum number of auto-created sub-channels per source prefix
    const MAX_SUB_CHANNELS_PER_SOURCE = 24;

    // Register callback for auto-creating channels from multiplexed plugins
    engine.onUnknownStreamId = (streamId: string) => {
      try {
        const colonIdx = streamId.indexOf(':');
        if (colonIdx < 1) return;

        const existingCh = store.getState().channels[streamId];
        if (existingCh) {
          if (!existingCh.enabled) {
            store.getState().updateChannel(streamId, { enabled: true });
          }
          return;
        }

        const prefix = streamId.slice(0, colonIdx);
        const subCount = Object.keys(store.getState().channels)
          .filter((id) => id.startsWith(`${prefix}:`)).length;
        if (subCount >= MAX_SUB_CHANNELS_PER_SOURCE) {
          console.warn(`[onUnknownStreamId] ${streamId} skipped — ${prefix} has ${subCount}/${MAX_SUB_CHANNELS_PER_SOURCE} sub-channels`);
          return;
        }

        const serviceName = streamId.slice(colonIdx + 1);
        const cfg = streamId.startsWith('chrome:')
          ? createBrowserChannelConfig(serviceName)
          : streamId.startsWith('system:')
            ? createSystemChannelConfig(serviceName)
            : streamId.startsWith('watch:')
              ? createWatchChannelConfig(serviceName)
              : createOtlpChannelConfig(serviceName);
        console.log(`[onUnknownStreamId] Creating channel: ${streamId}`);
        store.getState().addChannel({ ...cfg, streamId });
      } catch (err) {
        console.error(`[onUnknownStreamId] Error for ${streamId}:`, err);
      }
    };

    const currentPlugins = pluginsRef.current;
    const { setStreamState } = store.getState();
    const manager = new StreamManager({ setStreamState }, engine, currentPlugins);

    engineRef.current = engine;
    managerRef.current = manager;
    cleanupVisRef.current = setupVisibilityHandler();

    engine.start();
    // Force re-render so components see the new engine ref
    setTick((t) => t + 1);

    // Resume audio + reconnect streams when page becomes visible
    const handleResume = async () => {
      if (document.hidden || !useStore.getState().isPlaying) return;
      try {
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext;
        await ctx.resume();
        engine.start();
        const ch = useStore.getState().channels;
        const activeStreams = useStore.getState().activeStreams;
        for (const [streamId, config] of Object.entries(ch)) {
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
      engineRef.current = null;
      managerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, isPlaying]);

  // Connect/disconnect streams when channel enabled state changes
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isPlaying) return;

    for (const [streamId, config] of Object.entries(channels)) {
      if (config.parentPluginId) continue;
      const streamState = useStore.getState().activeStreams[streamId];
      if (config.enabled && !streamState) {
        console.log(`[streams] connecting ${streamId}`);
        manager.connectStream(streamId);
      } else if (!config.enabled && streamState) {
        manager.disconnectStream(streamId);
      }
    }
  }, [channels, isPlaying]);

  const startAudio = useCallback(() => {
    if (useStore.getState().isPlaying) return;
    try {
      // Synchronous — must be in user gesture for AudioContext
      Tone.start();
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      if (rawCtx.state !== 'running') rawCtx.resume();
    } catch (err) {
      console.error('[startAudio] AudioContext init failed:', err);
      return; // Don't transition to playing if audio can't start
    }
    setPlaying(true);
    // Engine will be created by the effect on next render

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'streamscapes',
        artist: 'Real-time data sonification',
      });
    }
  }, [setPlaying]);

  const stopAudio = useCallback(() => {
    setPlaying(false);
    managerRef.current?.dispose();
    engineRef.current?.dispose();
    cleanupVisRef.current?.();
    engineRef.current = null;
    managerRef.current = null;
    cleanupVisRef.current = null;
    initializedRef.current = false;
    setTick((t) => t + 1); // Force re-render so components see null engine
  }, [setPlaying]);

  return {
    engine: engineRef.current,
    manager: managerRef.current,
    plugins,
    startAudio,
    stopAudio,
    isPlaying,
  };
}
