import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';

export interface StreamState {
  status: 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface StreamscapesStore {
  // Audio config
  isPlaying: boolean;
  global: GlobalConfig;
  channels: Record<string, ChannelConfig>;

  // Stream state
  activeStreams: Record<string, StreamState>;

  // UI
  selectedChannelId: string | null;

  // Actions
  setPlaying(playing: boolean): void;
  updateChannel(streamId: string, partial: Partial<ChannelConfig>): void;
  updateGlobal(partial: Partial<GlobalConfig>): void;
  setStreamState(streamId: string, state: StreamState | null): void;
  addChannel(config: ChannelConfig): void;
  removeChannel(streamId: string): void;
  setSelectedChannel(id: string | null): void;
}

const DEFAULT_GLOBAL: GlobalConfig = {
  rootNote: 'C4',
  scale: 'major pentatonic',
  tempo: 120,
  masterVolume: 0,
};

export const useStore = create<StreamscapesStore>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        isPlaying: false,
        global: DEFAULT_GLOBAL,
        channels: {},
        activeStreams: {},
        selectedChannelId: null,

        setPlaying: (playing) => set({ isPlaying: playing }),

        updateChannel: (streamId, partial) =>
          set((state) => {
            const updated = { ...state.channels[streamId], ...partial };
            const channels = { ...state.channels, [streamId]: updated };

            // Exclusive solo: if soloing this channel, unsolo all others
            if (partial.solo === true) {
              for (const id of Object.keys(channels)) {
                if (id !== streamId) {
                  channels[id] = { ...channels[id], solo: false };
                }
              }
            }

            return { channels };
          }),

        updateGlobal: (partial) =>
          set((state) => ({
            global: { ...state.global, ...partial },
          })),

        setStreamState: (streamId, streamState) =>
          set((state) => {
            if (streamState === null) {
              const { [streamId]: _, ...rest } = state.activeStreams;
              return { activeStreams: rest };
            }
            return {
              activeStreams: { ...state.activeStreams, [streamId]: streamState },
            };
          }),

        addChannel: (config) =>
          set((state) => ({
            channels: { ...state.channels, [config.streamId]: config },
          })),

        removeChannel: (streamId) =>
          set((state) => {
            const { [streamId]: _, ...rest } = state.channels;
            return { channels: rest };
          }),

        setSelectedChannel: (id) => set({ selectedChannelId: id }),
      }),
      {
        name: 'streamscapes-store',
        version: 6, // v6: web UI redesign — force reseed
        partialize: (state) => ({
          global: state.global,
          channels: state.channels,
        }),
        migrate: () => {
          // Wipe channels on version bump — defaults will be re-seeded
          return { global: DEFAULT_GLOBAL, channels: {} };
        },
      }
    )
  )
);
