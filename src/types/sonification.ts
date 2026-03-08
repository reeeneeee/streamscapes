export type MappingCurve = 'linear' | 'logarithmic' | 'exponential' | 'step';

export interface SonificationMapping {
  readonly sourceField: string;
  readonly targetParam: string;
  readonly curve: MappingCurve;
  readonly inputRange: [number, number];
  readonly outputRange: [number, number];
  readonly invert: boolean;
  readonly smoothingMs?: number; // per-row output smoothing window in ms
  readonly quantizeStep?: number; // 0 disables; output-domain step size
  readonly hysteresis?: number; // 0 disables; output-domain deadband
}

export type SynthType =
  | 'Synth'
  | 'FMSynth'
  | 'AMSynth'
  | 'PluckSynth'
  | 'MembraneSynth'
  | 'NoiseSynth';

export type SonificationMode = 'triggered' | 'continuous' | 'pattern';
export type BehaviorType = 'ambient' | 'event' | 'hybrid';
export type AmbientMode = 'arpeggio' | 'sustain' | 'sample';
export type EventArticulation = 'soft' | 'neutral' | 'punchy';
export type PreMapStatistic = 'mean' | 'median';
export type AlertTier = 'advisory' | 'abnormal' | 'critical';

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
  readonly mode: SonificationMode;
  readonly synthType: SynthType;
  readonly synthOptions: Record<string, unknown>;
  readonly mappings: readonly SonificationMapping[];
  readonly effects: readonly EffectConfig[];
  readonly volume: number; // dB
  readonly pan: number; // -1 to 1
  readonly mute: boolean;
  readonly solo: boolean;
  readonly behaviorType?: BehaviorType;
  readonly ambientMode?: AmbientMode;
  readonly eventCooldownMs?: number;
  readonly eventTriggerThreshold?: number; // 0..1 normalized activity delta required to trigger
  readonly eventBurstCap?: number; // max triggers within eventBurstWindowMs; 0 disables cap
  readonly eventBurstWindowMs?: number; // rolling burst window size
  readonly eventArticulation?: EventArticulation;
  readonly smoothingMs?: number;
  readonly preMapWindow?: number; // rolling window size, 1 disables
  readonly preMapStatistic?: PreMapStatistic; // mean | median
  readonly preMapChangeThreshold?: number; // change-only deadband in source units
  readonly preMapDerivative?: boolean; // map derivatives instead of absolute values
  readonly preMapPercentileClamp?: number; // 50..100; 100 disables
  readonly alertTier?: AlertTier;
  readonly beaconThreshold?: number; // normalized 0..1 threshold crossing, 0 disables
  readonly beaconPeriodicSec?: number; // periodic beacon interval, 0 disables
  readonly beaconOnExtrema?: boolean; // emit when new min/max is observed
  readonly hybridAccent?: number; // 0..1 event-lane accent level in hybrid mode
  readonly sampleSource?: string; // URL or symbolic source id for sample ambient mode
  readonly samplePlaybackRateMin?: number; // playback rate lower bound
  readonly samplePlaybackRateMax?: number; // playback rate upper bound
  readonly sampleDensity?: number; // retrigger density in Hz for sample ambient mode
  readonly sampleFilterCutoff?: number; // lowpass cutoff in Hz
  readonly sampleReverbSend?: number; // 0..1 reverb wet send for sample ambient mode
  // Continuous mode: which field identifies each entity (e.g. 'flightId')
  readonly entityField?: string;
  // Pattern mode: pattern type for Tone.Pattern
  readonly patternType?: string;
}

export interface GlobalConfig {
  readonly rootNote: string; // e.g. 'C4'
  readonly scale: string; // e.g. 'major pentatonic'
  readonly tempo: number;
  readonly masterVolume: number; // dB
}
