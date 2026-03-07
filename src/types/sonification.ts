export type MappingCurve = 'linear' | 'logarithmic' | 'exponential' | 'step';

export interface SonificationMapping {
  readonly sourceField: string;
  readonly targetParam: string;
  readonly curve: MappingCurve;
  readonly inputRange: [number, number];
  readonly outputRange: [number, number];
  readonly invert: boolean;
}

export type SynthType =
  | 'Synth'
  | 'FMSynth'
  | 'AMSynth'
  | 'PluckSynth'
  | 'MembraneSynth'
  | 'NoiseSynth';

export type EffectType =
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'distortion'
  | 'filter'
  | 'compressor';

export interface EffectConfig {
  readonly type: EffectType;
  readonly wet: number;
  readonly bypass: boolean;
  readonly params: Record<string, number>;
}

export interface ChannelConfig {
  readonly streamId: string;
  readonly enabled: boolean;
  readonly synthType: SynthType;
  readonly synthOptions: Record<string, unknown>;
  readonly mappings: readonly SonificationMapping[];
  readonly effects: readonly EffectConfig[];
  readonly volume: number; // dB
  readonly pan: number; // -1 to 1
  readonly mute: boolean;
  readonly solo: boolean;
}

export interface GlobalConfig {
  readonly rootNote: string; // e.g. 'C4'
  readonly scale: string; // e.g. 'major pentatonic'
  readonly tempo: number;
  readonly masterVolume: number; // dB
}
