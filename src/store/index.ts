import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';
import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';

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
  resetAudioConfig(): void;
}

const DEFAULT_GLOBAL: GlobalConfig = {
  rootNote: 'C4',
  scale: 'major pentatonic',
  tempo: 120,
  masterVolume: 0,
};

function cloneDefaultChannels(): Record<string, ChannelConfig> {
  const clones = JSON.parse(JSON.stringify(ALL_DEFAULT_CHANNELS)) as ChannelConfig[];
  return Object.fromEntries(clones.map((cfg) => [cfg.streamId, cfg]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isGlobalConfig(value: unknown): value is GlobalConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.rootNote === 'string' &&
    typeof value.scale === 'string' &&
    isFiniteNumber(value.tempo) &&
    isFiniteNumber(value.masterVolume)
  );
}

function isMapping(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.inputRange) || value.inputRange.length !== 2) return false;
  if (!Array.isArray(value.outputRange) || value.outputRange.length !== 2) return false;
  if (value.smoothingMs !== undefined && !isFiniteNumber(value.smoothingMs)) return false;
  if (value.quantizeStep !== undefined && !isFiniteNumber(value.quantizeStep)) return false;
  if (value.hysteresis !== undefined && !isFiniteNumber(value.hysteresis)) return false;
  return (
    typeof value.sourceField === 'string' &&
    typeof value.targetParam === 'string' &&
    typeof value.curve === 'string' &&
    typeof value.invert === 'boolean' &&
    value.inputRange.every(isFiniteNumber) &&
    value.outputRange.every(isFiniteNumber)
  );
}

function isEffect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === 'string' &&
    isFiniteNumber(value.wet) &&
    typeof value.bypass === 'boolean' &&
    isRecord(value.params) &&
    Object.values(value.params).every(isFiniteNumber)
  );
}

function isChannelConfig(value: unknown): value is ChannelConfig {
  if (!isRecord(value)) return false;
  if (!isRecord(value.synthOptions)) return false;
  if (!Array.isArray(value.mappings) || !value.mappings.every(isMapping)) return false;
  if (!Array.isArray(value.effects) || !value.effects.every(isEffect)) return false;
  if (value.entityField !== undefined && typeof value.entityField !== 'string') return false;
  if (value.patternType !== undefined && typeof value.patternType !== 'string') return false;
  if (value.behaviorType !== undefined && !['ambient', 'event', 'hybrid'].includes(String(value.behaviorType))) return false;
  if (value.ambientMode !== undefined && !['arpeggio', 'sustain', 'sample', 'loop', 'drone'].includes(String(value.ambientMode))) return false;
  if (value.eventCooldownMs !== undefined && !isFiniteNumber(value.eventCooldownMs)) return false;
  if (value.eventTriggerThreshold !== undefined && !isFiniteNumber(value.eventTriggerThreshold)) return false;
  if (value.eventBurstCap !== undefined && !isFiniteNumber(value.eventBurstCap)) return false;
  if (value.eventBurstWindowMs !== undefined && !isFiniteNumber(value.eventBurstWindowMs)) return false;
  if (value.eventArticulation !== undefined && !['soft', 'neutral', 'punchy'].includes(String(value.eventArticulation))) return false;
  if (value.smoothingMs !== undefined && !isFiniteNumber(value.smoothingMs)) return false;
  if (value.preMapWindow !== undefined && !isFiniteNumber(value.preMapWindow)) return false;
  if (value.preMapStatistic !== undefined && !['mean', 'median'].includes(String(value.preMapStatistic))) return false;
  if (value.preMapChangeThreshold !== undefined && !isFiniteNumber(value.preMapChangeThreshold)) return false;
  if (value.preMapDerivative !== undefined && typeof value.preMapDerivative !== 'boolean') return false;
  if (value.preMapPercentileClamp !== undefined && !isFiniteNumber(value.preMapPercentileClamp)) return false;
  if (value.alertTier !== undefined && !['advisory', 'abnormal', 'critical'].includes(String(value.alertTier))) return false;
  if (value.beaconThreshold !== undefined && !isFiniteNumber(value.beaconThreshold)) return false;
  if (value.beaconPeriodicSec !== undefined && !isFiniteNumber(value.beaconPeriodicSec)) return false;
  if (value.beaconOnExtrema !== undefined && typeof value.beaconOnExtrema !== 'boolean') return false;
  if (value.hybridAccent !== undefined && !isFiniteNumber(value.hybridAccent)) return false;
  if (value.sampleSource !== undefined && typeof value.sampleSource !== 'string') return false;
  if (value.samplePlaybackRateMin !== undefined && !isFiniteNumber(value.samplePlaybackRateMin)) return false;
  if (value.samplePlaybackRateMax !== undefined && !isFiniteNumber(value.samplePlaybackRateMax)) return false;
  if (value.sampleDensity !== undefined && !isFiniteNumber(value.sampleDensity)) return false;
  if (value.sampleFilterCutoff !== undefined && !isFiniteNumber(value.sampleFilterCutoff)) return false;
  if (value.sampleReverbSend !== undefined && !isFiniteNumber(value.sampleReverbSend)) return false;
  return (
    typeof value.streamId === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.mode === 'string' &&
    typeof value.synthType === 'string' &&
    isFiniteNumber(value.volume) &&
    isFiniteNumber(value.pan) &&
    typeof value.mute === 'boolean' &&
    typeof value.solo === 'boolean'
  );
}

function sanitizeChannels(value: unknown): Record<string, ChannelConfig> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  const sanitized: Record<string, ChannelConfig> = {};
  for (const [id, channel] of entries) {
    if (!isChannelConfig(channel)) return null;
    if (channel.streamId !== id) return null;
    sanitized[id] = channel.solo && channel.mute ? { ...channel, solo: false } : channel;
  }
  return sanitized;
}

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
            const selectedChannelId = state.selectedChannelId;

            // Solo means "only this one is heard":
            // - soloing a channel disables + un-solos all others
            // - enabling a channel clears any existing solo elsewhere
            if (partial.solo === true) {
              for (const id of Object.keys(channels)) {
                if (id !== streamId) {
                  channels[id] = { ...channels[id], solo: false, enabled: false };
                }
              }
            } else if (partial.enabled === true) {
              for (const id of Object.keys(channels)) {
                if (id !== streamId && channels[id].solo) {
                  channels[id] = { ...channels[id], solo: false };
                }
              }
            }

            return { channels, selectedChannelId };
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
          set((state) => {
            const channels = { ...state.channels, [config.streamId]: config };
            const selectedChannelId = state.selectedChannelId ?? config.streamId;
            return { channels, selectedChannelId };
          }),

        removeChannel: (streamId) =>
          set((state) => {
            const { [streamId]: _, ...rest } = state.channels;
            return { channels: rest };
          }),

        setSelectedChannel: (id) => set({ selectedChannelId: id }),
        resetAudioConfig: () =>
          set({
            global: DEFAULT_GLOBAL,
            channels: cloneDefaultChannels(),
            selectedChannelId: 'weather',
          }),
      }),
      {
        name: 'streamscapes-store',
        version: 14,
        partialize: (state) => ({
          // Never persist isPlaying — audio must start from a user gesture
          global: state.global,
          channels: state.channels,
          selectedChannelId: state.selectedChannelId,
        }),
        migrate: () => {
          // Wipe on version bump to apply current defaults safely.
          return { global: DEFAULT_GLOBAL, channels: cloneDefaultChannels() };
        },
        merge: (persistedState, currentState) => {
          if (!isRecord(persistedState)) return currentState;
          const global = isGlobalConfig(persistedState.global)
            ? persistedState.global
            : null;
          const channels = sanitizeChannels(persistedState.channels);
          if (!global || !channels) {
            return {
              ...currentState,
              global: DEFAULT_GLOBAL,
              channels: cloneDefaultChannels(),
            };
          }
          return {
            ...currentState,
            global,
            channels,
            selectedChannelId: typeof persistedState.selectedChannelId === 'string' ? persistedState.selectedChannelId : currentState.selectedChannelId,
          };
        },
      }
    )
  )
);
