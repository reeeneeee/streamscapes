import type { ChannelConfig } from '@/types/sonification';

/** Parent channel for weather — controls whether the weather plugin connects.
 *  Does not produce sound — sub-channels (weather:temp, weather:clouds) handle audio. */
export const DEFAULT_WEATHER_CHANNEL: ChannelConfig = {
  streamId: 'weather',
  enabled: true,
  mode: 'pattern',
  synthType: 'Synth',
  synthOptions: { oscillator: { type: 'sine' } },
  mappings: [],
  effects: [],
  volume: -60,
  pan: 0,
  mute: true,
  solo: false,
  behaviorType: 'ambient',
  ambientMode: 'arpeggio',
  smoothingMs: 1200,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  eventTriggerThreshold: 0,
  eventBurstCap: 0,
  eventBurstWindowMs: 1200,
  eventArticulation: 'neutral',
  hybridAccent: 0.6,
  sampleSource: 'rain',
  samplePlaybackRateMin: 0.8,
  samplePlaybackRateMax: 1.2,
  sampleDensity: 1.2,
  sampleFilterCutoff: 2200,
  sampleReverbSend: 0.25,
};

export const DEFAULT_WEATHER_TEMP_CHANNEL: ChannelConfig = {
  streamId: 'weather:temp',
  enabled: true,
  mode: 'pattern',
  synthType: 'Synth',
  synthOptions: { oscillator: { type: 'sine' } },
  parentPluginId: 'weather',
  mappings: [
    {
      sourceField: 'feelsLike',
      targetParam: 'patternSelect',
      curve: 'step',
      inputRange: [-10, 110],
      outputRange: [0, 2],
      invert: false,
    },
  ],
  effects: [],
  volume: -12,
  pan: 0,
  mute: false,
  solo: false,
  intent: 'pure',
  behaviorType: 'ambient',
  ambientMode: 'arpeggio',
  smoothingMs: 1200,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  eventTriggerThreshold: 0,
  eventBurstCap: 0,
  eventBurstWindowMs: 1200,
  eventArticulation: 'neutral',
  hybridAccent: 0.6,
  sampleSource: 'rain',
  samplePlaybackRateMin: 0.8,
  samplePlaybackRateMax: 1.2,
  sampleDensity: 1.2,
  sampleFilterCutoff: 2200,
  sampleReverbSend: 0.25,
  patternType: 'walk',
};

export const DEFAULT_WEATHER_CLOUDS_CHANNEL: ChannelConfig = {
  streamId: 'weather:clouds',
  enabled: true,
  mode: 'continuous',
  synthType: 'Synth',
  synthOptions: {
    oscillator: { type: 'sine' },
  },
  noiseType: 'brown',
  parentPluginId: 'weather',
  mappings: [
    {
      sourceField: 'clouds',
      targetParam: 'noiseVolume',
      curve: 'linear',
      inputRange: [0, 100],
      outputRange: [-48, -8],
      invert: false,
    },
  ],
  effects: [],
  volume: -10,
  pan: 0,
  mute: false,
  solo: false,
  behaviorType: 'ambient',
  ambientMode: 'sustain',
  smoothingMs: 1200,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  eventTriggerThreshold: 0,
  eventBurstCap: 0,
  eventBurstWindowMs: 1200,
  eventArticulation: 'neutral',
  hybridAccent: 0.6,
  sampleSource: 'rain',
  samplePlaybackRateMin: 0.8,
  samplePlaybackRateMax: 1.2,
  sampleDensity: 1.2,
  sampleFilterCutoff: 2200,
  sampleReverbSend: 0.25,
};

export const DEFAULT_FLIGHTS_CHANNEL: ChannelConfig = {
  streamId: 'flights',
  enabled: true,
  mode: 'continuous',
  synthType: 'Synth',
  synthOptions: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.8 },
  },
  mappings: [
    {
      sourceField: 'frequency',
      targetParam: 'frequency',
      curve: 'linear',
      inputRange: [110, 880],
      outputRange: [110, 880],
      invert: false,
    },
  ],
  effects: [],
  volume: -20,
  pan: 0,
  mute: false,
  solo: false,
  intent: 'drone',
  behaviorType: 'ambient',
  ambientMode: 'sustain',
  smoothingMs: 800,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  eventTriggerThreshold: 0,
  eventBurstCap: 0,
  eventBurstWindowMs: 1200,
  eventArticulation: 'neutral',
  hybridAccent: 0.6,
  sampleSource: 'wind',
  samplePlaybackRateMin: 0.75,
  samplePlaybackRateMax: 1.1,
  sampleDensity: 0.8,
  sampleFilterCutoff: 1800,
  sampleReverbSend: 0.35,
  entityField: 'flightId',
};

export const DEFAULT_WIKIPEDIA_CHANNEL: ChannelConfig = {
  streamId: 'wikipedia',
  enabled: true,
  mode: 'triggered',
  synthType: 'Synth',
  synthOptions: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 },
  },
  mappings: [
    {
      sourceField: 'titleLength',
      targetParam: 'scaleIndex',
      curve: 'linear',
      inputRange: [0, 50],
      outputRange: [0, 12],
      invert: false,
    },
    {
      sourceField: 'absLengthDelta',
      targetParam: 'velocity',
      curve: 'exponential',
      inputRange: [0, 500],
      outputRange: [0.05, 1],
      invert: false,
    },
  ],
  effects: [],
  volume: -8,
  pan: 0,
  mute: false,
  solo: false,
  intent: 'chimes',
  behaviorType: 'event',
  eventCooldownMs: 160,
  preMapWindow: 3,
  preMapStatistic: 'median',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 98,
  alertTier: 'abnormal',
  beaconThreshold: 0.8,
  beaconPeriodicSec: 0,
  beaconOnExtrema: true,
  eventTriggerThreshold: 0.08,
  eventBurstCap: 4,
  eventBurstWindowMs: 1500,
  eventArticulation: 'neutral',
  hybridAccent: 0.6,
  sampleSource: 'vinyl',
  samplePlaybackRateMin: 0.9,
  samplePlaybackRateMax: 1.4,
  sampleDensity: 2.2,
  sampleFilterCutoff: 3500,
  sampleReverbSend: 0.15,
};

export const DEFAULT_RSS_CHANNEL: ChannelConfig = {
  streamId: 'rss',
  enabled: true,
  mode: 'triggered',
  synthType: 'PluckSynth',
  synthOptions: {},
  mappings: [
    {
      sourceField: 'titleLength',
      targetParam: 'scaleIndex',
      curve: 'linear',
      inputRange: [0, 80],
      outputRange: [0, 12],
      invert: false,
    },
    {
      sourceField: 'contentLength',
      targetParam: 'velocity',
      curve: 'logarithmic',
      inputRange: [0, 1000],
      outputRange: [0.1, 0.8],
      invert: false,
    },
  ],
  effects: [],
  volume: -10,
  pan: -0.3,
  mute: false,
  solo: false,
  intent: 'plucks',
  behaviorType: 'event',
  eventCooldownMs: 220,
  preMapWindow: 3,
  preMapStatistic: 'median',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 98,
  alertTier: 'advisory',
  beaconThreshold: 0.85,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  eventTriggerThreshold: 0.04,
  eventBurstCap: 3,
  eventBurstWindowMs: 1400,
  eventArticulation: 'soft',
  hybridAccent: 0.6,
  sampleSource: 'chimes',
  samplePlaybackRateMin: 0.9,
  samplePlaybackRateMax: 1.3,
  sampleDensity: 1.8,
  sampleFilterCutoff: 4200,
  sampleReverbSend: 0.2,
};

export const DEFAULT_STOCKS_CHANNEL: ChannelConfig = {
  streamId: 'stocks',
  enabled: true,
  mode: 'triggered',
  synthType: 'MembraneSynth',
  synthOptions: {},
  mappings: [
    {
      sourceField: 'priceDeltaPct',
      targetParam: 'velocity',
      curve: 'exponential',
      inputRange: [0, 5],
      outputRange: [0.1, 1],
      invert: false,
    },
    {
      sourceField: 'direction',
      targetParam: 'scaleIndex',
      curve: 'step',
      inputRange: [0, 1],
      outputRange: [0, 4],
      invert: false,
    },
  ],
  effects: [],
  volume: -10,
  pan: 0.3,
  mute: false,
  solo: false,
  intent: 'heartbeat',
  behaviorType: 'event',
  eventCooldownMs: 180,
  preMapWindow: 5,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 97,
  alertTier: 'critical',
  beaconThreshold: 0.9,
  beaconPeriodicSec: 0,
  beaconOnExtrema: true,
  eventTriggerThreshold: 0.1,
  eventBurstCap: 5,
  eventBurstWindowMs: 1500,
  sampleSource: 'vinyl',
  samplePlaybackRateMin: 0.85,
  samplePlaybackRateMax: 1.5,
  sampleDensity: 2.4,
  sampleFilterCutoff: 2800,
  sampleReverbSend: 0.12,
  eventArticulation: 'punchy',
  hybridAccent: 0.6,
};

/**
 * Template for dynamically-created OTLP service channels.
 * streamId is set at creation time to "otlp:<serviceName>".
 */
export function createOtlpChannelConfig(serviceName: string): ChannelConfig {
  return {
    streamId: `otlp:${serviceName}`,
    enabled: true,
    mode: 'triggered',
    synthType: 'Synth',
    synthOptions: { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.1, release: 0.3 } },
    volume: -8,
    pan: 0,
    mute: false,
    solo: false,
    effects: [],
    parentPluginId: 'otlp',
    mappings: [
      { sourceField: 'durationMs', targetParam: 'scaleIndex', curve: 'logarithmic', inputRange: [1, 10000], outputRange: [0, 14], invert: false },
      { sourceField: 'durationMs', targetParam: 'duration', curve: 'logarithmic', inputRange: [1, 10000], outputRange: [0.2, 1.2], invert: false },
      { sourceField: 'isError', targetParam: 'velocity', curve: 'step', inputRange: [0, 1], outputRange: [0.45, 0.65], invert: false },
      { sourceField: 'isError', targetParam: 'filterCutoff', curve: 'step', inputRange: [0, 1], outputRange: [6000, 1200], invert: false },
      { sourceField: 'isError', targetParam: 'detune', curve: 'step', inputRange: [0, 1], outputRange: [0, 150], invert: false },
    ],
    intent: 'chimes',
    behaviorType: 'event',
    eventCooldownMs: 50,
    eventBurstCap: 8,
    eventBurstWindowMs: 1000,
    eventArticulation: 'neutral',
    eventTriggerThreshold: 0,
    preMapWindow: 1,
    preMapStatistic: 'mean',
    preMapChangeThreshold: 0,
    preMapDerivative: false,
    preMapPercentileClamp: 100,
    alertTier: 'advisory',
    beaconThreshold: 0,
    beaconPeriodicSec: 0,
    beaconOnExtrema: false,
    hybridAccent: 0.6,
    sampleSource: '',
    samplePlaybackRateMin: 0.8,
    samplePlaybackRateMax: 1.5,
    sampleDensity: 1,
    sampleFilterCutoff: 4000,
    sampleReverbSend: 0,
  };
}

/**
 * Template for system health channels (CPU, memory, disk, Docker).
 * Continuous drone mode — each metric has a distinct timbre, pitch range,
 * pan position, and filter so they're distinguishable by ear.
 */
/**
 * Template for system health channels (CPU, memory, disk, Docker).
 * Continuous drone mode — each metric has a fixed pitch (musical interval apart)
 * and the data drives buzziness: calm when idle, aggressive under load.
 *
 * Breakpoints via step curves:
 *   0-40%  → clean, quiet
 *   40-70% → warmer, moderate buzz
 *   70-100% → harsh, loud, wide filter
 */
interface SystemVoice {
  frequency: number;   // fixed base pitch (Hz)
  pan: number;
  harmonicity: number;
}

const SYSTEM_VOICES: Record<string, SystemVoice> = {
  cpu:    { frequency: 220, pan: -0.5, harmonicity: 1 },    // A3 — warm fundamental
  memory: { frequency: 330, pan: 0,    harmonicity: 2 },    // E4 — fifth above
  disk:   { frequency: 165, pan: 0.5,  harmonicity: 1.5 },  // E3 — fifth below CPU, warm sub
};
const DEFAULT_SYSTEM_VOICE: SystemVoice = { frequency: 262, pan: 0, harmonicity: 1.5 };

export function createSystemChannelConfig(metricName: string): ChannelConfig {
  const v = SYSTEM_VOICES[metricName] ?? DEFAULT_SYSTEM_VOICE;
  return {
    streamId: `system:${metricName}`,
    enabled: true,
    mode: 'continuous',
    synthType: 'FMSynth',
    synthOptions: {
      oscillator: { type: 'sine' },
      envelope: { attack: 1.5, decay: 0.8, sustain: 0.9, release: 3.0 },
      harmonicity: v.harmonicity,
      modulationIndex: 0.5,
      modulation: { type: 'sine' },
    },
    volume: -30,
    pan: v.pan,
    mute: false,
    solo: false,
    effects: [
      { type: 'filter', wet: 1, bypass: false, params: { frequency: 400, Q: 0.7 } },
      { type: 'reverb', wet: 0.4, bypass: false, params: { decay: 4.2, preDelay: 0.02 } },
    ],
    parentPluginId: 'otlp',
    mappings: [
      // Fixed pitch — frequency stays constant
      { sourceField: 'percent', targetParam: 'frequency', curve: 'step', inputRange: [0, 100], outputRange: [v.frequency, v.frequency], invert: false },
      // Velocity: quiet when idle, louder under load
      { sourceField: 'percent', targetParam: 'velocity', curve: 'exponential', inputRange: [0, 100], outputRange: [0.03, 0.25], invert: false },
      // Modulation index: clean → harsh (buzziness increases with load)
      { sourceField: 'percent', targetParam: 'modulationIndex', curve: 'exponential', inputRange: [0, 100], outputRange: [0.5, 15], invert: false },
      // Filter opens up as load increases
      { sourceField: 'percent', targetParam: 'filterCutoff', curve: 'linear', inputRange: [0, 100], outputRange: [400, 4000], invert: false },
    ],
    intent: 'drone',
    behaviorType: 'ambient',
    ambientMode: 'sustain',
    smoothingMs: 2000,
    eventTriggerThreshold: 0,
    preMapWindow: 1,
    preMapStatistic: 'mean',
    preMapChangeThreshold: 0,
    preMapDerivative: false,
    preMapPercentileClamp: 100,
    alertTier: 'advisory',
    beaconThreshold: 0,
    beaconPeriodicSec: 0,
    beaconOnExtrema: false,
    hybridAccent: 0.6,
    sampleSource: '',
    samplePlaybackRateMin: 0.8,
    samplePlaybackRateMax: 1.5,
    sampleDensity: 1,
    sampleFilterCutoff: 4000,
    sampleReverbSend: 0,
    entityField: 'spanName',
  };
}

/** Parent channel for the OTLP plugin — controls whether the SSE stream connects.
 *  Enabled by default; SSE endpoint requires auth so it only works when signed in.
 *  Does not produce sound — sub-channels (otlp:<service>) handle audio. */
export const DEFAULT_OTLP_CHANNEL: ChannelConfig = {
  streamId: 'otlp',
  enabled: true,
  mode: 'triggered',
  synthType: 'Synth',
  synthOptions: { oscillator: { type: 'triangle' } },
  mappings: [],
  effects: [],
  volume: -60,
  pan: 0,
  mute: true,
  solo: false,
  behaviorType: 'event',
  eventCooldownMs: 50,
  eventBurstCap: 0,
  eventBurstWindowMs: 1000,
  eventArticulation: 'neutral',
  eventTriggerThreshold: 0,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  hybridAccent: 0.6,
  sampleSource: '',
  samplePlaybackRateMin: 0.8,
  samplePlaybackRateMax: 1.5,
  sampleDensity: 1,
  sampleFilterCutoff: 4000,
  sampleReverbSend: 0,
};

// Continuous signals (battery, cpu, memory) use a low sine drone.
// Battery is inverted: louder when low, nearly silent when full.
const CONTINUOUS_BROWSER_SIGNALS = new Set(['battery', 'cpu', 'memory']);

export function createBrowserChannelConfig(serviceName: string): ChannelConfig {
  const isContinuous = CONTINUOUS_BROWSER_SIGNALS.has(serviceName);
  const isBattery = serviceName === 'battery';

  const base: ChannelConfig = {
    streamId: `chrome:${serviceName}`,
    enabled: true,
    mode: isContinuous ? 'continuous' : 'triggered',
    synthType: 'Synth',
    synthOptions: {
      oscillator: { type: 'sine' },
      envelope: isContinuous
        ? { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.0 }
        : { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
    },
    volume: isBattery ? -35 : isContinuous ? -25 : -8,
    pan: 0,
    mute: false,
    solo: false,
    effects: [],
    parentPluginId: 'otlp',
    mappings: isBattery
      ? [
          // Battery level → frequency (low pitch when low, higher when full)
          { sourceField: 'level', targetParam: 'frequency', curve: 'linear', inputRange: [0, 100], outputRange: [80, 220], invert: false },
          // Battery level → amplitude — INVERTED: loud when low, quiet when full
          { sourceField: 'level', targetParam: 'velocity', curve: 'linear', inputRange: [0, 100], outputRange: [0.8, 0.05], invert: false },
        ]
      : serviceName === 'cpu'
        ? [
            { sourceField: 'usagePercent', targetParam: 'frequency', curve: 'linear', inputRange: [0, 100], outputRange: [110, 440], invert: false },
            { sourceField: 'usagePercent', targetParam: 'velocity', curve: 'linear', inputRange: [0, 100], outputRange: [0.1, 0.6], invert: false },
          ]
        : serviceName === 'memory'
          ? [
              { sourceField: 'usedPercent', targetParam: 'frequency', curve: 'linear', inputRange: [0, 100], outputRange: [130, 350], invert: false },
              { sourceField: 'usedPercent', targetParam: 'velocity', curve: 'linear', inputRange: [0, 100], outputRange: [0.1, 0.5], invert: false },
            ]
          : [
              // tabs / downloads — triggered chime
              { sourceField: 'tabCount', targetParam: 'scaleIndex', curve: 'linear', inputRange: [0, 30], outputRange: [0, 12], invert: false },
            ],
    behaviorType: isContinuous ? 'ambient' : 'event',
    ambientMode: isContinuous ? 'sustain' : undefined,
    smoothingMs: isContinuous ? 2000 : undefined,
    eventCooldownMs: isContinuous ? undefined : 100,
    eventBurstCap: isContinuous ? undefined : 4,
    eventBurstWindowMs: isContinuous ? undefined : 1000,
    eventArticulation: isContinuous ? undefined : 'neutral',
    eventTriggerThreshold: 0,
    preMapWindow: 1,
    preMapStatistic: 'mean',
    preMapChangeThreshold: 0,
    preMapDerivative: false,
    preMapPercentileClamp: 100,
    alertTier: 'advisory',
    beaconThreshold: 0,
    beaconPeriodicSec: 0,
    beaconOnExtrema: false,
    hybridAccent: 0.6,
    sampleSource: '',
    samplePlaybackRateMin: 0.8,
    samplePlaybackRateMax: 1.5,
    sampleDensity: 1,
    sampleFilterCutoff: 4000,
    sampleReverbSend: 0,
  };

  return base;
}

/**
 * Template for Apple Watch health channels (heart rate, steps, active energy).
 * Heart rate + active energy are continuous drones (FMSynth), steps are triggered (MembraneSynth).
 * BPM/calPerMin drive FM buzziness, steps drive velocity + pitch.
 */
interface WatchVoice {
  frequency: number;
  pan: number;
  mode: 'continuous' | 'triggered';
  synthType: 'FMSynth' | 'MembraneSynth';
}

const WATCH_VOICES: Record<string, WatchVoice> = {
  heartRate:    { frequency: 174, pan: -0.3, mode: 'continuous', synthType: 'FMSynth' },   // F3 — overridden to pattern below
  steps:        { frequency: 0,   pan: 0.3,  mode: 'triggered',  synthType: 'MembraneSynth' },
};

export function createWatchChannelConfig(metricName: string): ChannelConfig {
  const v = WATCH_VOICES[metricName] ?? { frequency: 174, pan: 0, mode: 'continuous', synthType: 'FMSynth' };
  const isTriggered = v.mode === 'triggered';
  const isHeartRate = metricName === 'heartRate';

  // Heart rate uses arpeggio pattern — BPM drives pattern selection + velocity
  if (isHeartRate) {
    return {
      streamId: `watch:${metricName}`,
      enabled: true,
      mode: 'pattern',
      synthType: 'Synth',
      synthOptions: { oscillator: { type: 'sine' } },
      volume: -12,
      pan: -0.3,
      mute: false,
      solo: false,
      effects: [],
      parentPluginId: 'otlp',
      mappings: [
        { sourceField: 'bpm', targetParam: 'patternSelect', curve: 'step', inputRange: [40, 180], outputRange: [0, 2], invert: false },
        { sourceField: 'bpm', targetParam: 'velocity', curve: 'exponential', inputRange: [40, 180], outputRange: [0.1, 0.6], invert: false },
      ],
      intent: 'pure',
      behaviorType: 'ambient',
      ambientMode: 'arpeggio',
      smoothingMs: 1200,
      patternType: 'walk',
      eventTriggerThreshold: 0,
      preMapWindow: 1,
      preMapStatistic: 'mean',
      preMapChangeThreshold: 0,
      preMapDerivative: false,
      preMapPercentileClamp: 100,
      alertTier: 'advisory',
      beaconThreshold: 0,
      beaconPeriodicSec: 0,
      beaconOnExtrema: false,
      hybridAccent: 0.6,
      sampleSource: '',
      samplePlaybackRateMin: 0.8,
      samplePlaybackRateMax: 1.5,
      sampleDensity: 1,
      sampleFilterCutoff: 4000,
      sampleReverbSend: 0,
    };
  }

  return {
    streamId: `watch:${metricName}`,
    enabled: true,
    mode: v.mode,
    synthType: v.synthType,
    synthOptions: isTriggered
      ? {}
      : {
          oscillator: { type: 'sine' },
          envelope: { attack: 1.5, decay: 0.8, sustain: 0.9, release: 3.0 },
          harmonicity: 1,
          modulationIndex: 0.3,
          modulation: { type: 'sine' },
        },
    volume: isTriggered ? -10 : -30,
    pan: v.pan,
    mute: false,
    solo: false,
    effects: isTriggered
      ? []
      : [
          { type: 'filter', wet: 1, bypass: false, params: { frequency: 300, Q: 0.7 } },
          { type: 'reverb', wet: 0.4, bypass: false, params: { decay: 5, preDelay: 0.02 } },
        ],
    parentPluginId: 'otlp',
    mappings: metricName === 'steps'
        ? [
            { sourceField: 'stepDelta', targetParam: 'velocity', curve: 'logarithmic', inputRange: [0, 200], outputRange: [0.15, 0.8], invert: false },
            { sourceField: 'stepDelta', targetParam: 'scaleIndex', curve: 'linear', inputRange: [0, 200], outputRange: [0, 7], invert: false },
          ]
        : [
            // fallback
            { sourceField: 'percent', targetParam: 'velocity', curve: 'linear', inputRange: [0, 100], outputRange: [0.05, 0.3], invert: false },
          ],
    intent: isTriggered ? 'heartbeat' : 'drone',
    behaviorType: isTriggered ? 'event' : 'ambient',
    ambientMode: isTriggered ? undefined : 'sustain',
    smoothingMs: isTriggered ? undefined : metricName === 'heartRate' ? 3000 : 5000,
    eventCooldownMs: isTriggered ? 500 : undefined,
    eventBurstCap: isTriggered ? 4 : undefined,
    eventBurstWindowMs: isTriggered ? 1000 : undefined,
    eventArticulation: isTriggered ? 'punchy' : undefined,
    eventTriggerThreshold: 0,
    preMapWindow: 1,
    preMapStatistic: 'mean',
    preMapChangeThreshold: 0,
    preMapDerivative: false,
    preMapPercentileClamp: 100,
    alertTier: 'advisory',
    beaconThreshold: 0,
    beaconPeriodicSec: 0,
    beaconOnExtrema: false,
    hybridAccent: 0.6,
    sampleSource: '',
    samplePlaybackRateMin: 0.8,
    samplePlaybackRateMax: 1.5,
    sampleDensity: 1,
    sampleFilterCutoff: 4000,
    sampleReverbSend: 0,
    entityField: isTriggered ? undefined : 'spanName',
  };
}

/** Internet Archive — single channel, mediatype mapped to pitch region. */
export const DEFAULT_ARCHIVE_CHANNEL: ChannelConfig = {
  streamId: 'archive',
  enabled: true,
  mode: 'triggered',
  synthType: 'FMSynth',
  synthOptions: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.8 },
    modulationIndex: 3,
    harmonicity: 8,
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.4 },
  },
  mappings: [
    // Mediatype selects pitch region (texts=low, audio=mid, movies=high, etc.)
    {
      sourceField: 'mediatypeIndex',
      targetParam: 'scaleIndex',
      curve: 'step',
      inputRange: [0, 7],
      outputRange: [0, 14],
      invert: false,
    },
    // Popularity: famous items ring out, obscure ones whisper
    {
      sourceField: 'downloads',
      targetParam: 'velocity',
      curve: 'logarithmic',
      inputRange: [1, 1_000_000],
      outputRange: [0.25, 0.9],
      invert: false,
    },
    // Popularity also lengthens resonance (duration must clear the 0.6s envelope decay)
    {
      sourceField: 'downloads',
      targetParam: 'duration',
      curve: 'logarithmic',
      inputRange: [1, 1_000_000],
      outputRange: [0.7, 1.8],
      invert: false,
    },
  ],
  effects: [],
  volume: -10,
  pan: 0.15,
  mute: false,
  solo: false,
  intent: 'kalimba',
  behaviorType: 'event',
  eventCooldownMs: 100,
  eventBurstCap: 6,
  eventBurstWindowMs: 1500,
  eventArticulation: 'soft',
  eventTriggerThreshold: 0,
  preMapWindow: 1,
  preMapStatistic: 'mean',
  preMapChangeThreshold: 0,
  preMapDerivative: false,
  preMapPercentileClamp: 100,
  alertTier: 'advisory',
  beaconThreshold: 0,
  beaconPeriodicSec: 0,
  beaconOnExtrema: false,
  hybridAccent: 0.6,
  sampleSource: '',
  samplePlaybackRateMin: 0.8,
  samplePlaybackRateMax: 1.5,
  sampleDensity: 1,
  sampleFilterCutoff: 4000,
  sampleReverbSend: 0,
};

export const ALL_DEFAULT_CHANNELS: ChannelConfig[] = [
  DEFAULT_WEATHER_CHANNEL,
  DEFAULT_WEATHER_TEMP_CHANNEL,
  DEFAULT_WEATHER_CLOUDS_CHANNEL,
  DEFAULT_FLIGHTS_CHANNEL,
  DEFAULT_WIKIPEDIA_CHANNEL,
  DEFAULT_ARCHIVE_CHANNEL,
  DEFAULT_RSS_CHANNEL,
  DEFAULT_STOCKS_CHANNEL,
  DEFAULT_OTLP_CHANNEL,
];
