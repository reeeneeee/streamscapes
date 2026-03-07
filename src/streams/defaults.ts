import type { ChannelConfig } from '@/types/sonification';

export const DEFAULT_WEATHER_CHANNEL: ChannelConfig = {
  streamId: 'weather',
  enabled: true,
  mode: 'pattern',
  synthType: 'Synth',
  synthOptions: { oscillator: { type: 'sine' } },
  mappings: [
    {
      sourceField: 'feelsLike',
      targetParam: 'patternSelect',
      curve: 'step',
      inputRange: [0, 100],
      outputRange: [0, 2],
      invert: false,
    },
    {
      sourceField: 'clouds',
      targetParam: 'noiseVolume',
      curve: 'linear',
      inputRange: [0, 100],
      outputRange: [-60, 0],
      invert: false,
    },
  ],
  effects: [],
  volume: 0,
  pan: 0,
  mute: false,
  solo: false,
  patternType: 'upDown',
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
  volume: 1,
  pan: 0,
  mute: false,
  solo: false,
};

export const ALL_DEFAULT_CHANNELS: ChannelConfig[] = [
  DEFAULT_WEATHER_CHANNEL,
  DEFAULT_FLIGHTS_CHANNEL,
  DEFAULT_WIKIPEDIA_CHANNEL,
];
