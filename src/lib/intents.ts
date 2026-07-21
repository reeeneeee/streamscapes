import type { ChannelConfig } from '@/types/sonification';

/** A named sonic character that can be applied to any stream channel. */
export interface StreamIntent {
  id: string;
  name: string;
  /** Partial channel config applied on top of defaults when selected */
  patch: Partial<ChannelConfig>;
}

/** Universal intent library — available for all streams.
 *  Every name corresponds to a recognizable instrument, texture, or sonic archetype.
 *  Synth recipes sourced from the official Tonejs/Presets repo + FM synthesis literature. */
export const INTENTS: StreamIntent[] = [
  {
    id: 'pure',
    name: 'Pure',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',
      effects: [],
      synthOptions: { oscillator: { type: 'sine' } },
    },
  },
  {
    id: 'music-box',
    name: 'Boop',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',

      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 900, Q: 0.8 } },
        { type: 'reverb', wet: 0.16, bypass: false, params: { decay: 2.4, preDelay: 0.01 } },
      ],
      synthOptions: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.003, decay: 0.18, sustain: 0.02, release: 0.12 },
      },
    },
  },
  {
    id: 'kalimba',
    name: 'Kalimba',
    patch: {
      synthType: 'FMSynth',
      mode: 'pattern',

      effects: [
        { type: 'reverb', wet: 0.3, bypass: false, params: { decay: 2.5, preDelay: 0.01 } },
      ],
      synthOptions: {
        harmonicity: 8,
        modulationIndex: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 2, sustain: 0.1, release: 2 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      },
    },
  },
  {
    id: 'steelpan',
    name: 'Steelpan',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',

      effects: [
        { type: 'reverb', wet: 0.25, bypass: false, params: { decay: 2, preDelay: 0.01 } },
      ],
      synthOptions: {
        oscillator: { type: 'fatcustom', partials: [0.2, 1, 0, 0.5, 0.1], spread: 40, count: 3 },
        envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
      },
    },
  },
  {
    id: 'chimes',
    name: 'Woodblock',
    patch: {
      synthType: 'Synth',
      mode: 'triggered',

      effects: [
        { type: 'reverb', wet: 0.4, bypass: false, params: { decay: 3, preDelay: 0.01 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.14, sustain: 0.03, release: 0.1 },
      },
    },
  },
  {
    id: 'marimba',
    name: 'Reception',
    patch: {
      synthType: 'Synth',
      mode: 'triggered',

      effects: [
        { type: 'reverb', wet: 0.2, bypass: false, params: { decay: 1.5, preDelay: 0.01 } },
      ],
      synthOptions: {
        oscillator: { partials: [1, 0, 2, 0, 3] },
        envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 },
      },
    },
  },
  {
    id: 'plucks',
    name: 'Tick Tock',
    patch: {
      synthType: 'PluckSynth',
      mode: 'pattern',

      effects: [
        { type: 'delay', wet: 0.2, bypass: false, params: { delayTime: 0.18, feedback: 0.3 } },
        { type: 'reverb', wet: 0.35, bypass: false, params: { decay: 3.5, preDelay: 0.02 } },
      ],
      synthOptions: { resonance: 0.96, dampening: 6000, release: 1.4 },
    },
  },
  {
    id: 'choir',
    name: 'Choir',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',

      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 1800, Q: 0.3 } },
        { type: 'reverb', wet: 0.75, bypass: false, params: { decay: 8, preDelay: 0.06 } },
        { type: 'chorus', wet: 0.3, bypass: false, params: { frequency: 0.3, depth: 0.4, delayTime: 6 } },
      ],
      synthOptions: {
        oscillator: { type: 'fatsine4', spread: 20, count: 4 },
        envelope: { attack: 1.2, decay: 1.5, sustain: 0.6, release: 3.0 },
      },
    },
  },
  {
    id: 'warm-pad',
    name: 'VHS',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',

      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 500, Q: 0.4 } },
        { type: 'reverb', wet: 0.5, bypass: false, params: { decay: 7, preDelay: 0.05 } },
      ],
      synthOptions: {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
        envelope: { attack: 2.0, decay: 1.5, sustain: 0.8, release: 4.0 },
      },
    },
  },
  {
    id: 'drone',
    name: 'Drone',
    patch: {
      synthType: 'FMSynth',
      mode: 'continuous',

      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 1400, Q: 0.7 } },
        { type: 'reverb', wet: 0.45, bypass: false, params: { decay: 4.2, preDelay: 0.02 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 1.5, decay: 0.8, sustain: 0.9, release: 3.0 },
      },
    },
  },
  {
    id: 'rain',
    name: 'Doppler',
    patch: {
      synthType: 'Synth',
      mode: 'pattern',

      effects: [
        { type: 'delay', wet: 0.45, bypass: false, params: { delayTime: 0.08, feedback: 0.4 } },
        { type: 'reverb', wet: 0.35, bypass: false, params: { decay: 3, preDelay: 0.01 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.04 },
      },
    },
  },
  {
    id: 'bubbles',
    name: 'Ping',
    patch: {
      synthType: 'FMSynth',
      mode: 'triggered',

      effects: [
        { type: 'reverb', wet: 0.35, bypass: false, params: { decay: 2.5, preDelay: 0.01 } },
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 2000, Q: 2.5 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.15 },
        modulationIndex: 18,
      },
    },
  },
  {
    id: 'typewriter',
    name: 'Chirp',
    patch: {
      synthType: 'MembraneSynth',
      mode: 'triggered',

      behaviorType: 'event',
      eventCooldownMs: 80,
      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 3000, Q: 1.5 } },
      ],
      synthOptions: {},
    },
  },
  {
    id: 'whispers',
    name: 'Echoes',
    patch: {
      synthType: 'AMSynth',
      mode: 'triggered',

      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 1200, Q: 0.4 } },
        { type: 'reverb', wet: 0.7, bypass: false, params: { decay: 5, preDelay: 0.04 } },
      ],
      synthOptions: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.15, decay: 0.4, sustain: 0.1, release: 0.8 },
      },
    },
  },
  // --- Noise presets (continuous channels) ---
  {
    id: 'white-noise',
    name: 'White Noise',
    patch: {
      mode: 'continuous',
      noiseType: 'white',
      synthType: 'Synth',
      synthOptions: { oscillator: { type: 'sine' } },
      effects: [],
    },
  },
  {
    id: 'pink-noise',
    name: 'Pink Noise',
    patch: {
      mode: 'continuous',
      noiseType: 'pink',
      synthType: 'Synth',
      synthOptions: { oscillator: { type: 'sine' } },
      effects: [],
    },
  },
  {
    id: 'brown-noise',
    name: 'Brown Noise',
    patch: {
      mode: 'continuous',
      noiseType: 'brown',
      synthType: 'Synth',
      synthOptions: { oscillator: { type: 'sine' } },
      effects: [],
    },
  },
  {
    id: 'green-noise',
    name: 'Green Noise',
    patch: {
      mode: 'continuous',
      noiseType: 'green',
      synthType: 'Synth',
      synthOptions: { oscillator: { type: 'sine' } },
      effects: [
        { type: 'filter', wet: 1, bypass: false, params: { frequency: 500, Q: 1.2 } },
      ],
    },
  },
];

/** Get an intent by id */
export function getIntent(intentId?: string): StreamIntent | undefined {
  if (!intentId) return undefined;
  return INTENTS.find((i) => i.id === intentId);
}

/** @deprecated — use getIntent() instead */
export function getIntentForChannel(_streamId: string, intentId?: string): StreamIntent | undefined {
  return getIntent(intentId);
}
