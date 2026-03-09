import * as Tone from 'tone';
import type { AlertTier, ChannelConfig, EffectConfig, EffectType, EventArticulation, GlobalConfig, SynthType } from '@/types/sonification';
import type { DataPoint } from '@/types/stream';
import { applyMappings, clearMappingStateForPrefix } from './mapping-engine';
import {
  articulationDuration as eventArticulationDuration,
  articulationVelocity as eventArticulationVelocity,
  eventMetricFromParams,
  nextBurstHistory,
  passesCooldown,
  passesThreshold,
} from './event-shaping';
import Scale from '@tonaljs/scale';

// --- Types ---

type ToneEffect = Tone.Reverb | Tone.FeedbackDelay | Tone.Chorus | Tone.Distortion | Tone.Filter | Tone.Compressor;

interface BaseNodes {
  channel: Tone.Channel;
  analyzer: Tone.Analyser;
  insertEffects: ToneEffect[];
  synthType: string;
  effectsKey: string;
  synthOptionsKey: string;
  behaviorKey: string;
}

interface TriggeredNodes extends BaseNodes {
  mode: 'triggered';
  synth: Tone.PolySynth;
  filter: Tone.Filter;
}

interface ContinuousEntity {
  synth: Tone.Synth;
  lfo: Tone.LFO;
  lastSeen: number;
}

interface ContinuousNodes extends BaseNodes {
  mode: 'continuous';
  entities: Map<string, ContinuousEntity>;
}

interface PatternNodes extends BaseNodes {
  mode: 'pattern';
  synth: Tone.Synth;
  pattern: Tone.Pattern<string>;
  samplePlayer: Tone.Player | null;
  sampleLoop: Tone.Loop | null;
  sampleFilter: Tone.Filter | null;
  sampleReverb: Tone.Reverb | null;
  sampleGain: Tone.Gain | null;
  sampleSource: string | null;
  noise: Tone.Noise | null;
  noiseFilter: Tone.Filter | null;
  hybridSustainSynth: Tone.Synth | null;
  hybridSustainFreq: number | null;
  hybridEventGain: Tone.Gain | null;
  hybridEventFilter: Tone.Filter | null;
  hybridEventSynth: Tone.PolySynth | null;
}

type ChannelNodes = TriggeredNodes | ContinuousNodes | PatternNodes;

interface StoreState {
  channels: Record<string, ChannelConfig>;
  global: GlobalConfig;
  isPlaying: boolean;
}

export interface AudioEngineStore {
  getState(): StoreState;
  subscribe: <T>(
    selector: (state: StoreState) => T,
    listener: (curr: T, prev: T) => void,
    options?: { equalityFn?: (a: T, b: T) => boolean }
  ) => () => void;
}

/**
 * Arpeggio shape library.
 * Each shape is an array of scale-degree indices (0-based) defining the note sequence.
 * Index values wrap around the available notes via modulo.
 *
 * Inspired by classic arpeggiator modes, walking bass patterns, and sequencer shapes.
 */
export const ARP_SHAPES: Record<string, { label: string; degrees: number[] }> = {
  // Classic arpeggiator patterns
  up:        { label: 'Up',           degrees: [0, 1, 2, 3, 4] },
  down:      { label: 'Down',         degrees: [4, 3, 2, 1, 0] },
  upDown:    { label: 'Up-Down',      degrees: [0, 1, 2, 3, 4, 3, 2, 1] },
  skip:      { label: 'Skip (1-3-5)', degrees: [0, 2, 4, 2, 4, 2] },         // ABCBCB — original

  // Walking bass / melodic patterns
  walk:      { label: 'Walk',         degrees: [0, 1, 2, 4, 2, 1] },          // climb-and-fall
  pedal:     { label: 'Pedal',        degrees: [0, 2, 0, 4, 0, 2] },          // root anchored
  pendulum:  { label: 'Pendulum',     degrees: [0, 4, 1, 3, 2] },             // outside-in converge

  // Rhythmic / synth patterns
  stutter:   { label: 'Stutter',      degrees: [0, 0, 2, 0, 4, 4] },          // repetition-driven
  cascade:   { label: 'Cascade',      degrees: [0, 1, 2, 1, 2, 3, 2, 3, 4] }, // overlapping climb
  leap:      { label: 'Leap',         degrees: [0, 4, 1, 3, 2, 4] },          // wide intervals
};

/** Expand scale notes into an arpeggio sequence using the given shape. */
function expandArpShape(notes: string[], shape: string): string[] {
  const def = ARP_SHAPES[shape] ?? ARP_SHAPES.skip;
  if (notes.length === 0) return notes;
  return def.degrees.map((d) => notes[d % notes.length]);
}

// TODO: Host our own ambient samples. Tone.js GitHub Pages hosting is gone (404).
// Sample mode will be silent until these URLs are replaced with working sources.
const SAMPLE_SOURCE_URLS: Record<string, string> = {
  // rain: 'https://example.com/samples/rain_ambience.mp3',
  // wind: 'https://example.com/samples/wind_ambience.mp3',
  // vinyl: 'https://example.com/samples/vinyl_noise.mp3',
  // chimes: 'https://example.com/samples/chimes.mp3',
};

// --- Engine ---

export class AudioEngine {
  private channelNodes = new Map<string, ChannelNodes>();
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;
  private masterAnalyzer: Tone.Analyser;
  private unsubscribers: (() => void)[] = [];
  private store: AudioEngineStore;
  private entityCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private lastScaleKey = '';
  private lastTriggeredAt = new Map<string, number>();
  private eventHistoryByStream = new Map<string, number[]>();
  private lastEventMetricByStream = new Map<string, number>();
  private lastDataPointByStream = new Map<string, DataPoint>();
  private mappingState = new Map<string, { lastOutput: number; lastUpdatedMs: number }>();
  private preMapRawPrev = new Map<string, number>();
  private preMapFilteredPrev = new Map<string, number>();
  private preMapRollingValues = new Map<string, number[]>();
  private preMapHistoryValues = new Map<string, number[]>();
  private beaconMetricRangeByStream = new Map<string, { min: number; max: number }>();
  private beaconLastMetricByStream = new Map<string, number>();
  private beaconLastPeriodicAt = new Map<string, number>();
  private beaconLastEmitAt = new Map<string, number>();
  private patternSmoothingState = new Map<string, { updatedAt: number; patternSelect?: number; noiseVolume?: number }>();
  private patternHysteresis = new Map<string, number>(); // current locked pattern index per stream
  // Callbacks for UI data (flights for visualizer, weather display, mapping preview, etc.)
  private dataListeners = new Map<string, { streamId: string; listener: (data: DataPoint) => void }>();

  constructor(store: AudioEngineStore) {
    this.store = store;

    // Master bus: Compressor -> Limiter -> Analyser -> Destination
    this.masterAnalyzer = new Tone.Analyser('waveform', 256);
    this.masterCompressor = new Tone.Compressor(-24, 4);
    this.masterLimiter = new Tone.Limiter(-1);
    this.masterCompressor.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyzer);
    this.masterAnalyzer.toDestination();

    // Subscribe to channel config changes
    this.unsubscribers.push(
      store.subscribe(
        (state: StoreState) => state.channels,
        (channels: Record<string, ChannelConfig>) => this.reconcileChannels(channels)
      )
    );

    // Subscribe to global config changes
    this.unsubscribers.push(
      store.subscribe(
        (state: StoreState) => state.global,
        (global: GlobalConfig) => this.applyGlobalConfig(global)
      )
    );

    // Apply initial state
    const { channels, global } = store.getState();
    this.applyGlobalConfig(global);
    this.reconcileChannels(channels);

    // Clean up stale continuous entities every 30s
    this.entityCleanupInterval = setInterval(() => this.cleanupStaleEntities(), 30_000);
  }

  // --- Data listener registration (for UI like visualizer) ---

  onData(listenerId: string, listener: (data: DataPoint) => void, streamId?: string) {
    this.dataListeners.set(listenerId, { streamId: streamId ?? listenerId, listener });
  }

  offData(listenerId: string) {
    this.dataListeners.delete(listenerId);
  }

  // --- Channel reconciliation ---

  private reconcileChannels(channels: Record<string, ChannelConfig>) {
    // Remove channels that no longer exist
    for (const [id, nodes] of this.channelNodes) {
      if (!channels[id]) {
        this.disposeChannel(id, nodes);
      }
    }

    // Add or update channels
    for (const [id, config] of Object.entries(channels)) {
      if (!config.enabled) {
        if (this.channelNodes.has(id)) {
          this.disposeChannel(id, this.channelNodes.get(id)!);
        }
        continue;
      }

      const existing = this.channelNodes.get(id);
      if (!existing) {
        this.createChannel(id, config);
      } else if (
        existing.mode !== config.mode ||
        existing.synthType !== config.synthType ||
        this.effectsChanged(existing, config) ||
        existing.behaviorKey !== AudioEngine.behaviorKey(config) ||
        (existing.mode === 'pattern' && existing.pattern.pattern !== (config.patternType ?? 'upDown'))
      ) {
        // Rebuild on mode/synth/effects/pattern-type changes.
        this.disposeChannel(id, existing);
        this.createChannel(id, config);
      } else {
        this.updateChannel(existing, config);
      }
    }
  }

  private createToneEffect(cfg: EffectConfig): ToneEffect {
    let effect: ToneEffect;
    switch (cfg.type) {
      case 'reverb':
        effect = new Tone.Reverb({ decay: cfg.params.decay ?? 2.5, preDelay: cfg.params.preDelay ?? 0.01 });
        break;
      case 'delay':
        effect = new Tone.FeedbackDelay({ delayTime: cfg.params.delayTime ?? 0.25, feedback: cfg.params.feedback ?? 0.3 });
        break;
      case 'chorus':
        effect = new Tone.Chorus({ frequency: cfg.params.frequency ?? 1.5, depth: cfg.params.depth ?? 0.7, delayTime: cfg.params.delayTime ?? 3.5 }).start();
        break;
      case 'distortion':
        effect = new Tone.Distortion(cfg.params.distortion ?? 0.4);
        break;
      case 'filter':
        effect = new Tone.Filter({ frequency: cfg.params.frequency ?? 1000, Q: cfg.params.Q ?? 1 });
        break;
      case 'compressor':
        effect = new Tone.Compressor(cfg.params.threshold ?? -24, cfg.params.ratio ?? 4);
        break;
    }
    if ('wet' in effect) {
      (effect as Tone.Reverb).wet.value = cfg.bypass ? 0 : cfg.wet;
    }
    return effect;
  }

  private buildInsertChain(config: ChannelConfig, source: Tone.ToneAudioNode, dest: Tone.ToneAudioNode): ToneEffect[] {
    const effects: ToneEffect[] = [];
    let prev: Tone.ToneAudioNode = source;
    for (const cfg of config.effects) {
      const fx = this.createToneEffect(cfg);
      prev.connect(fx);
      effects.push(fx);
      prev = fx;
    }
    prev.connect(dest);
    return effects;
  }

  private createChannel(id: string, config: ChannelConfig) {
    const targetVolume = config.volume;
    const initialVolume = Tone.context.state === 'running' ? -60 : targetVolume;
    const channel = new Tone.Channel({
      volume: initialVolume,
      pan: config.pan,
      mute: config.mute,
    });
    if (Tone.context.state === 'running') {
      const now = Tone.now();
      channel.volume.cancelScheduledValues(now);
      channel.volume.rampTo(targetVolume, 0.05);
    }
    const analyzer = new Tone.Analyser('waveform', 1024);
    channel.connect(analyzer);
    analyzer.connect(this.masterCompressor);

    switch (config.mode) {
      case 'triggered':
        this.createTriggeredChannel(id, config, channel, analyzer);
        break;
      case 'continuous':
        this.createContinuousChannel(id, config, channel, analyzer);
        break;
      case 'pattern':
        this.createPatternChannel(id, config, channel, analyzer);
        break;
    }
  }

  private static effectsKey(config: ChannelConfig): string {
    return JSON.stringify(config.effects);
  }

  private static synthOptionsKey(config: ChannelConfig): string {
    return JSON.stringify(config.synthOptions);
  }

  private static behaviorKey(config: ChannelConfig): string {
    return JSON.stringify({
      behaviorType: config.behaviorType ?? 'event',
    });
  }

  private sampleSourceUrl(source?: string): string {
    if (!source) return SAMPLE_SOURCE_URLS.rain ?? '';
    return SAMPLE_SOURCE_URLS[source] ?? '';
  }

  private sampleDriverValue(params: Partial<Record<string, number>>): number {
    if (typeof params.patternSelect === 'number') return Math.max(0, Math.min(1, params.patternSelect / 2));
    if (typeof params.velocity === 'number') return Math.max(0, Math.min(1, params.velocity));
    if (typeof params.scaleIndex === 'number') return Math.max(0, Math.min(1, Math.abs(params.scaleIndex) / 12));
    if (typeof params.frequency === 'number') {
      const hz = Math.max(40, Math.min(2200, params.frequency));
      return (hz - 40) / (2200 - 40);
    }
    return 0.5;
  }

  private effectsChanged(nodes: ChannelNodes, config: ChannelConfig): boolean {
    return nodes.effectsKey !== AudioEngine.effectsKey(config);
  }

  private mappedParams(
    dataPoint: DataPoint,
    config: ChannelConfig,
    global: GlobalConfig,
    lane: string
  ): Partial<Record<string, number>> {
    const nowMs = Number.isFinite(dataPoint.timestamp) ? dataPoint.timestamp : Date.now();
    return applyMappings(dataPoint, config.mappings, global, {
      state: this.mappingState,
      stateKeyPrefix: `${dataPoint.streamId}:${lane}`,
      nowMs,
    });
  }

  private applyMappedPan(channel: Tone.Channel, panValue: number | undefined): void {
    if (typeof panValue !== 'number') return;
    const pan = Math.max(-1, Math.min(1, panValue));
    const now = Tone.now();
    channel.pan.cancelScheduledValues(now);
    channel.pan.rampTo(pan, 0.05);
  }

  private mappedDuration(
    mappedSeconds: number | undefined,
    articulation: EventArticulation
  ): number | string {
    if (typeof mappedSeconds === 'number') {
      return Math.max(0.03, Math.min(3, mappedSeconds));
    }
    return eventArticulationDuration(articulation);
  }

  private primaryMetric(dataPoint: DataPoint, config: ChannelConfig): number | undefined {
    for (const m of config.mappings) {
      const v = dataPoint.fields[m.sourceField];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    for (const v of Object.values(dataPoint.fields)) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return undefined;
  }

  private normalizedMetric(streamId: string, metric: number): number {
    const prev = this.beaconMetricRangeByStream.get(streamId);
    if (!prev) {
      this.beaconMetricRangeByStream.set(streamId, { min: metric, max: metric });
      return 0.5;
    }
    const min = Math.min(prev.min, metric);
    const max = Math.max(prev.max, metric);
    this.beaconMetricRangeByStream.set(streamId, { min, max });
    if (max <= min) return 0.5;
    return Math.max(0, Math.min(1, (metric - min) / (max - min)));
  }

  private beaconTone(tier: AlertTier): { note: string; velocity: number; duration: string } {
    switch (tier) {
      case 'critical': return { note: 'C6', velocity: 0.95, duration: '16n' };
      case 'abnormal': return { note: 'G5', velocity: 0.72, duration: '8n' };
      default: return { note: 'E5', velocity: 0.55, duration: '8n' };
    }
  }

  private emitBeacon(nodes: ChannelNodes, config: ChannelConfig, reason: string): void {
    if (Tone.context.state !== 'running') return;
    const key = `${config.streamId}:${reason}`;
    const nowMs = Date.now();
    const tier: AlertTier = config.alertTier ?? 'advisory';
    const minInterval = tier === 'critical' ? 120 : tier === 'abnormal' ? 180 : 260;
    const last = this.beaconLastEmitAt.get(key) ?? 0;
    if (nowMs - last < minInterval) return;
    this.beaconLastEmitAt.set(key, nowMs);

    const { note, velocity, duration } = this.beaconTone(tier);
    const when = Tone.now();

    if (nodes.mode === 'triggered') {
      nodes.synth.triggerAttackRelease(note, duration, when, velocity);
      return;
    }
    if (nodes.mode === 'pattern') {
      if (nodes.hybridEventSynth) {
        nodes.hybridEventSynth.triggerAttackRelease(note, duration, when, velocity);
      } else {
        nodes.synth.triggerAttackRelease(note, duration, when, velocity);
      }
      return;
    }
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.1, sustain: 0.05, release: 0.15 },
    }).connect(nodes.channel);
    synth.triggerAttackRelease(note, duration, when, velocity);
    setTimeout(() => synth.dispose(), 300);
  }

  private maybeEmitMonitoringBeacon(
    nodes: ChannelNodes,
    dataPoint: DataPoint,
    config: ChannelConfig
  ): void {
    const metric = this.primaryMetric(dataPoint, config);
    if (metric === undefined) return;
    const norm = this.normalizedMetric(config.streamId, metric);
    const threshold = Math.max(0, Math.min(1, config.beaconThreshold ?? 0));
    const prevNorm = this.beaconLastMetricByStream.get(config.streamId);
    const nowMs = Date.now();

    if (config.beaconPeriodicSec && config.beaconPeriodicSec > 0) {
      const intervalMs = config.beaconPeriodicSec * 1000;
      const lastPeriodic = this.beaconLastPeriodicAt.get(config.streamId) ?? 0;
      if (nowMs - lastPeriodic >= intervalMs) {
        this.beaconLastPeriodicAt.set(config.streamId, nowMs);
        this.emitBeacon(nodes, config, 'periodic');
      }
    }

    if (threshold > 0 && prevNorm !== undefined && prevNorm < threshold && norm >= threshold) {
      this.emitBeacon(nodes, config, 'threshold');
    }
    if (threshold > 0 && prevNorm !== undefined && prevNorm >= threshold && norm < threshold) {
      this.emitBeacon(nodes, config, 'threshold-clear');
    }

    if (config.beaconOnExtrema && prevNorm !== undefined) {
      const range = this.beaconMetricRangeByStream.get(config.streamId);
      if (range && (metric <= range.min || metric >= range.max)) {
        this.emitBeacon(nodes, config, 'extrema');
      }
    }

    this.beaconLastMetricByStream.set(config.streamId, norm);
  }

  private preMapKey(streamId: string, field: string): string {
    return `${streamId}:${field}`;
  }

  private clearPreMapState(streamId: string): void {
    const prefix = `${streamId}:`;
    for (const key of this.preMapRawPrev.keys()) {
      if (key.startsWith(prefix)) this.preMapRawPrev.delete(key);
    }
    for (const key of this.preMapFilteredPrev.keys()) {
      if (key.startsWith(prefix)) this.preMapFilteredPrev.delete(key);
    }
    for (const key of this.preMapRollingValues.keys()) {
      if (key.startsWith(prefix)) this.preMapRollingValues.delete(key);
    }
    for (const key of this.preMapHistoryValues.keys()) {
      if (key.startsWith(prefix)) this.preMapHistoryValues.delete(key);
    }
  }

  private percentile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))));
    return sorted[idx];
  }

  private applyPreMapFilters(dataPoint: DataPoint, config: ChannelConfig): DataPoint {
    const window = Math.max(1, Math.floor(config.preMapWindow ?? 1));
    const statistic = config.preMapStatistic ?? 'mean';
    const threshold = Math.max(0, config.preMapChangeThreshold ?? 0);
    const derivative = config.preMapDerivative ?? false;
    const clampPercentile = Math.max(50, Math.min(100, config.preMapPercentileClamp ?? 100));

    if (window <= 1 && threshold <= 0 && !derivative && clampPercentile >= 100) {
      return dataPoint;
    }

    const fields: Record<string, number | string | boolean> = { ...dataPoint.fields };
    for (const [field, raw] of Object.entries(dataPoint.fields)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const key = this.preMapKey(dataPoint.streamId, field);
      let value = raw;

      if (derivative) {
        const prevRaw = this.preMapRawPrev.get(key);
        this.preMapRawPrev.set(key, raw);
        value = prevRaw === undefined ? 0 : raw - prevRaw;
      } else {
        this.preMapRawPrev.set(key, raw);
      }

      if (window > 1) {
        const samples = this.preMapRollingValues.get(key) ?? [];
        samples.push(value);
        while (samples.length > window) samples.shift();
        this.preMapRollingValues.set(key, samples);
        if (statistic === 'median') {
          const sorted = [...samples].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        } else {
          value = samples.reduce((sum, n) => sum + n, 0) / samples.length;
        }
      }

      if (clampPercentile < 100) {
        const hist = this.preMapHistoryValues.get(key) ?? [];
        hist.push(value);
        while (hist.length > 128) hist.shift();
        this.preMapHistoryValues.set(key, hist);
        if (hist.length >= 8) {
          const sorted = [...hist].sort((a, b) => a - b);
          const q = (100 - clampPercentile) / 200;
          const low = this.percentile(sorted, q);
          const high = this.percentile(sorted, 1 - q);
          value = Math.max(low, Math.min(high, value));
        }
      }

      if (threshold > 0) {
        const prevFiltered = this.preMapFilteredPrev.get(key);
        if (prevFiltered !== undefined && Math.abs(value - prevFiltered) < threshold) {
          value = prevFiltered;
        }
      }

      this.preMapFilteredPrev.set(key, value);
      fields[field] = value;
    }

    return { ...dataPoint, fields };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private synthClass(synthType: SynthType): any {
    switch (synthType) {
      case 'FMSynth': return Tone.FMSynth;
      case 'AMSynth': return Tone.AMSynth;
      case 'MembraneSynth': return Tone.MembraneSynth;
      case 'PluckSynth': return Tone.PluckSynth;
      // NoiseSynth does not behave as pitched voice for these pathways.
      case 'NoiseSynth': return Tone.Synth;
      default: return Tone.Synth;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private polyVoiceClass(synthType: SynthType): any {
    // PolySynth voices must extend Tone.Monophonic.
    switch (synthType) {
      case 'FMSynth': return Tone.FMSynth;
      case 'AMSynth': return Tone.AMSynth;
      case 'MembraneSynth': return Tone.MembraneSynth;
      default: return Tone.Synth;
    }
  }

  private makePatternSynth(config: ChannelConfig): Tone.Synth {
    const Cls = this.synthClass(config.synthType);
    const opts: Record<string, unknown> = {};
    if (config.synthType !== 'PluckSynth' && config.synthType !== 'MembraneSynth') {
      if (config.synthOptions.oscillator) opts.oscillator = config.synthOptions.oscillator;
      if (config.synthOptions.envelope) opts.envelope = config.synthOptions.envelope;
    }
    return new Cls(opts);
  }

  private createTriggeredChannel(
    id: string,
    config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    const filter = new Tone.Filter({ type: 'highpass', frequency: 50, Q: 1 });
    const Cls = this.polyVoiceClass(config.synthType);
    const synthOpts: Record<string, unknown> = {
      envelope: (config.synthOptions.envelope as Record<string, number>) ?? {
        attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1,
      },
    };
    if (config.synthType !== 'PluckSynth' && config.synthType !== 'MembraneSynth') {
      synthOpts.oscillator = (config.synthOptions.oscillator as Record<string, unknown>) ?? { type: 'sine' };
    }
    const synth = new Tone.PolySynth(Cls, synthOpts);
    synth.connect(filter);
    const insertEffects = this.buildInsertChain(config, filter, channel);

    this.channelNodes.set(id, {
      mode: 'triggered',
      synthType: config.synthType,
      effectsKey: AudioEngine.effectsKey(config),
      synthOptionsKey: AudioEngine.synthOptionsKey(config),
      behaviorKey: AudioEngine.behaviorKey(config),
      synth,
      filter,
      channel,
      analyzer,
      insertEffects,
    });
  }

  private createContinuousChannel(
    id: string,
    config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    // Entities (individual drones) are created dynamically as data arrives
    const nodes: ContinuousNodes = {
      mode: 'continuous',
      synthType: config.synthType,
      effectsKey: AudioEngine.effectsKey(config),
      synthOptionsKey: AudioEngine.synthOptionsKey(config),
      behaviorKey: AudioEngine.behaviorKey(config),
      entities: new Map(),
      channel,
      analyzer,
      insertEffects: [],
    };
    this.channelNodes.set(id, nodes);

    // If we've already received data for this stream, bootstrap sustain immediately.
    const cached = this.lastDataPointByStream.get(id);
    if (cached) {
      this.handleContinuous(nodes, cached, config, this.store.getState().global);
    }
  }

  private createPatternChannel(
    id: string,
    config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    const synth = this.makePatternSynth(config);
    const insertEffects = this.buildInsertChain(config, synth, channel);
    const sampleFilter = new Tone.Filter({ type: 'lowpass', frequency: Math.max(200, Math.min(10_000, config.sampleFilterCutoff ?? 2200)), Q: 0.7 });
    const sampleReverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01 });
    sampleReverb.wet.value = Math.max(0, Math.min(1, config.sampleReverbSend ?? 0.25));
    const sampleGain = new Tone.Gain(0.85);
    sampleFilter.connect(sampleReverb);
    sampleReverb.connect(sampleGain);
    sampleGain.connect(channel);
    const sampleUrl = this.sampleSourceUrl(config.sampleSource);
    const samplePlayer = new Tone.Player({
      url: sampleUrl || undefined,
      autostart: false,
      loop: false,
      fadeIn: 0.01,
      fadeOut: 0.06,
    }).connect(sampleFilter);
    const sampleLoop = new Tone.Loop((time) => {
      if (!samplePlayer.loaded) return;
      samplePlayer.start(time);
    }, Math.max(0.1, 1 / Math.max(0.2, config.sampleDensity ?? 1.2)));

    const { global } = this.store.getState();
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const initialNotes = scaleNotes.length > 0 ? scaleNotes.slice(0, 3) : ['C4', 'E4', 'G4'];

    const pattern = new Tone.Pattern(
      (time, note) => {
        // Use configured envelope if present; not all synth classes expose `envelope`.
        const env = config.synthOptions.envelope as Record<string, number> | undefined;
        const atk = typeof env?.attack === 'number' ? env.attack : 0.01;
        const dec = typeof env?.decay === 'number' ? env.decay : 0.2;
        const minDur = atk + dec + 0.05;
        const dur = Math.max(Tone.Time('8n').toSeconds(), minDur);
        synth.triggerAttackRelease(note, dur, time);
      },
      expandArpShape(initialNotes, config.patternType ?? 'skip'),
      'up' // Shape is pre-expanded, just traverse in order
    );

    let hybridEventGain: Tone.Gain | null = null;
    let hybridEventFilter: Tone.Filter | null = null;
    let hybridEventSynth: Tone.PolySynth | null = null;
    let hybridSustainSynth: Tone.Synth | null = null;

    if (config.behaviorType === 'hybrid') {
      hybridSustainSynth = new Tone.Synth({
        oscillator: (config.synthOptions.oscillator as Record<string, unknown>) ?? { type: 'triangle' },
        envelope: (config.synthOptions.envelope as Record<string, number>) ?? {
          attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.2,
        },
      });
      hybridSustainSynth.connect(channel);
      hybridEventGain = new Tone.Gain(Math.max(0, Math.min(1, config.hybridAccent ?? 0.6)));
      hybridEventFilter = new Tone.Filter({ type: 'highpass', frequency: 120, Q: 0.5 });
      hybridEventSynth = new Tone.PolySynth(this.polyVoiceClass(config.synthType), {
        envelope: (config.synthOptions.envelope as Record<string, number>) ?? {
          attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.12,
        },
      });
      hybridEventSynth.connect(hybridEventFilter);
      hybridEventFilter.connect(hybridEventGain);
      hybridEventGain.connect(channel);
    }

    const nodes: PatternNodes = {
      mode: 'pattern',
      synthType: config.synthType,
      effectsKey: AudioEngine.effectsKey(config),
      synthOptionsKey: AudioEngine.synthOptionsKey(config),
      behaviorKey: AudioEngine.behaviorKey(config),
      synth,
      pattern,
      samplePlayer,
      sampleLoop,
      sampleFilter,
      sampleReverb,
      sampleGain,
      sampleSource: this.sampleSourceUrl(config.sampleSource),
      noise: null,
      noiseFilter: null,
      hybridSustainSynth,
      hybridSustainFreq: null,
      hybridEventGain,
      hybridEventFilter,
      hybridEventSynth,
      channel,
      analyzer,
      insertEffects,
    };
    this.channelNodes.set(id, nodes);

    const hybridSustain = config.behaviorType === 'hybrid' && config.ambientMode === 'sustain';
    const cached = this.lastDataPointByStream.get(id);
    if (cached) {
      this.handlePattern(nodes, cached, config, global);
    } else if (hybridSustain && nodes.hybridSustainSynth) {
      const rootFreq = initialNotes.length > 0 ? Tone.Frequency(initialNotes[0]).toFrequency() : 440;
      nodes.hybridSustainSynth.triggerAttack(rootFreq, Tone.now());
      nodes.hybridSustainFreq = rootFreq;
    }

    // Start transport; only start pattern when ambient mode is arpeggio.
    if (this.store.getState().isPlaying) {
      Tone.getTransport().start();
      const sampleMode = config.ambientMode === 'sample';
      if (sampleMode) {
        if (sampleLoop.state !== 'started') sampleLoop.start(0);
      } else if (!hybridSustain) {
        pattern.start();
      }
    }
  }

  private updateChannel(nodes: ChannelNodes, config: ChannelConfig) {
    nodes.behaviorKey = AudioEngine.behaviorKey(config);
    nodes.channel.volume.value = config.volume;
    nodes.channel.pan.value = config.pan;

    // Solo logic: if any channel is soloed, mute non-soloed channels
    const allChannels = this.store.getState().channels;
    const anySoloed = Object.values(allChannels).some((c) => c.solo);
    nodes.channel.mute = config.mute || (anySoloed && !config.solo);

    if (nodes.synthOptionsKey !== AudioEngine.synthOptionsKey(config)) {
      nodes.synthOptionsKey = AudioEngine.synthOptionsKey(config);
      if (nodes.mode === 'pattern') {
        const env = config.synthOptions?.envelope as Record<string, number> | undefined;
        const osc = config.synthOptions?.oscillator as Record<string, unknown> | undefined;
        if (env) (nodes.synth as Tone.Synth).set({ envelope: env });
        if (osc && config.synthType !== 'PluckSynth' && config.synthType !== 'MembraneSynth') {
          (nodes.synth as Tone.Synth).set({ oscillator: osc });
        }
      } else if (nodes.mode === 'triggered') {
        const env = config.synthOptions?.envelope as Record<string, number> | undefined;
        const osc = config.synthOptions?.oscillator as Record<string, unknown> | undefined;
        if (env) (nodes.synth as Tone.PolySynth).set({ envelope: env });
        if (osc && config.synthType !== 'PluckSynth' && config.synthType !== 'MembraneSynth') {
          (nodes.synth as Tone.PolySynth).set({ oscillator: osc });
        }
      }
    }

    if (nodes.mode === 'pattern' && nodes.hybridEventGain) {
      nodes.hybridEventGain.gain.value = Math.max(0, Math.min(1, config.hybridAccent ?? 0.6));
    }

    if (nodes.mode === 'pattern') {
      this.applyPatternBehaviorImmediately(config.streamId, nodes, config, this.store.getState().global);
      this.applyPatternSampleSettings(nodes, config);
    }
  }

  private applyPatternSampleSettings(nodes: PatternNodes, config: ChannelConfig) {
    if (!nodes.samplePlayer || !nodes.sampleLoop) return;
    const nextSrc = this.sampleSourceUrl(config.sampleSource);
    if (nextSrc && nodes.sampleSource !== nextSrc) {
      nodes.sampleSource = nextSrc;
      nodes.samplePlayer.load(nextSrc);
    }
    const density = Math.max(0.2, config.sampleDensity ?? 1.2);
    nodes.sampleLoop.interval = 1 / density;
    if (nodes.sampleFilter) {
      nodes.sampleFilter.frequency.value = Math.max(200, Math.min(10_000, config.sampleFilterCutoff ?? 2200));
    }
    if (nodes.sampleReverb) {
      nodes.sampleReverb.wet.value = Math.max(0, Math.min(1, config.sampleReverbSend ?? 0.25));
    }
  }

  private applyPatternBehaviorImmediately(
    streamId: string,
    nodes: PatternNodes,
    config: ChannelConfig,
    global: GlobalConfig
  ) {
    if (Tone.context.state !== 'running') return;
    const sampleMode = config.ambientMode === 'sample';
    if (sampleMode) {
      if (nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
      }
      if (nodes.hybridSustainSynth && nodes.hybridSustainFreq !== null) {
        nodes.hybridSustainSynth.triggerRelease(Tone.now());
        nodes.hybridSustainFreq = null;
      }
      if (nodes.sampleLoop && nodes.sampleLoop.state !== 'started') {
        nodes.sampleLoop.start(0);
      }
      return;
    }
    if (nodes.sampleLoop && nodes.sampleLoop.state === 'started') {
      nodes.sampleLoop.stop();
      nodes.sampleLoop.cancel();
    }
    if (config.behaviorType !== 'hybrid') return;

    const hybridSustain = config.ambientMode === 'sustain';
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const rootFreq = scaleNotes.length > 0 ? Tone.Frequency(scaleNotes[0]).toFrequency() : 440;

    if (hybridSustain) {
      if (nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
      }
      if (!nodes.hybridSustainSynth) return;
      const cached = this.lastDataPointByStream.get(streamId);
      let targetFreq = rootFreq;
      if (cached) {
        const params = applyMappings(cached, config.mappings, global);
        if (typeof params.frequency === 'number') {
          targetFreq = Math.max(20, Math.min(2000, params.frequency));
        } else if (typeof params.scaleIndex === 'number' && scaleNotes.length > 0) {
          const idx = Math.abs(Math.floor(params.scaleIndex)) % scaleNotes.length;
          targetFreq = Tone.Frequency(scaleNotes[idx]).toFrequency();
        }
      }

      const now = Tone.now();
      if (nodes.hybridSustainFreq === null) {
        nodes.hybridSustainSynth.triggerAttack(targetFreq, now + 0.005);
      } else {
        const timeConstant = Math.max(0.02, Math.max(0, config.smoothingMs ?? 0) / 1000);
        nodes.hybridSustainSynth.frequency.cancelScheduledValues(now);
        nodes.hybridSustainSynth.frequency.setTargetAtTime(targetFreq, now, timeConstant);
      }
      nodes.hybridSustainFreq = targetFreq;
      return;
    }

    if (nodes.hybridSustainSynth && nodes.hybridSustainFreq !== null) {
      nodes.hybridSustainSynth.triggerRelease(Tone.now());
      nodes.hybridSustainFreq = null;
    }
    if (nodes.pattern.state !== 'started') {
      nodes.pattern.start();
    }
  }

  private disposeChannel(id: string, nodes: ChannelNodes) {
    this.channelNodes.delete(id);
    clearMappingStateForPrefix(this.mappingState, `${id}:`);
    this.clearPreMapState(id);
    this.patternSmoothingState.delete(id);
    this.lastDataPointByStream.delete(id);
    this.lastTriggeredAt.delete(id);
    this.lastTriggeredAt.delete(`${id}:hybrid`);
    this.beaconMetricRangeByStream.delete(id);
    this.beaconLastMetricByStream.delete(id);
    this.beaconLastPeriodicAt.delete(id);
    for (const key of this.beaconLastEmitAt.keys()) {
      if (key.startsWith(`${id}:`)) this.beaconLastEmitAt.delete(key);
    }
    this.eventHistoryByStream.delete(id);
    this.eventHistoryByStream.delete(`${id}:hybrid`);
    this.lastEventMetricByStream.delete(id);
    this.lastEventMetricByStream.delete(`${id}:hybrid`);

    const disposeNow = () => {
      // Dispose insert effects
      for (const fx of nodes.insertEffects) {
        fx.dispose();
      }

      switch (nodes.mode) {
        case 'triggered':
          nodes.synth.dispose();
          nodes.filter.dispose();
          break;
        case 'continuous':
          for (const [, entity] of nodes.entities) {
            entity.synth.triggerRelease();
            entity.synth.dispose();
            entity.lfo.dispose();
          }
          nodes.entities.clear();
          break;
        case 'pattern':
          nodes.pattern.stop();
          nodes.pattern.dispose();
          nodes.synth.dispose();
          if (nodes.sampleLoop) { nodes.sampleLoop.stop(); nodes.sampleLoop.dispose(); }
          if (nodes.samplePlayer) { nodes.samplePlayer.stop(); nodes.samplePlayer.dispose(); }
          if (nodes.sampleFilter) { nodes.sampleFilter.dispose(); }
          if (nodes.sampleReverb) { nodes.sampleReverb.dispose(); }
          if (nodes.sampleGain) { nodes.sampleGain.dispose(); }
          if (nodes.noise) { nodes.noise.stop(); nodes.noise.dispose(); }
          if (nodes.noiseFilter) { nodes.noiseFilter.dispose(); }
          if (nodes.hybridSustainSynth) {
            if (nodes.hybridSustainFreq !== null) nodes.hybridSustainSynth.triggerRelease();
            nodes.hybridSustainSynth.dispose();
          }
          if (nodes.hybridEventSynth) { nodes.hybridEventSynth.dispose(); }
          if (nodes.hybridEventFilter) { nodes.hybridEventFilter.dispose(); }
          if (nodes.hybridEventGain) { nodes.hybridEventGain.dispose(); }
          break;
      }
      nodes.channel.dispose();
      nodes.analyzer.dispose();
    };

    if (Tone.context.state !== 'running') {
      disposeNow();
      return;
    }

    const now = Tone.now();
    nodes.channel.volume.cancelScheduledValues(now);
    nodes.channel.volume.rampTo(-60, 0.04);
    setTimeout(disposeNow, 50);
  }

  private applyGlobalConfig(global: GlobalConfig) {
    Tone.getDestination().volume.value = global.masterVolume;
    if (global.tempo > 0) {
      Tone.getTransport().bpm.value = global.tempo;
    }

    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const rootScaleFreq =
      scaleNotes.length > 0 ? Tone.Frequency(scaleNotes[0]).toFrequency() : 440;

    // Retune active sustain drones immediately when global tonal center changes.
    for (const [streamId, nodes] of this.channelNodes) {
      if (nodes.mode !== 'continuous') continue;
      const config = this.store.getState().channels[streamId];
      if (!config) continue;
      const shouldRetuneToRoot =
        config.behaviorType === 'ambient' && config.ambientMode === 'sustain';
      if (!shouldRetuneToRoot) continue;
      for (const [, entity] of nodes.entities) {
        entity.synth.frequency.setValueAtTime(rootScaleFreq, Tone.now());
        entity.lfo.min = rootScaleFreq * 0.995;
        entity.lfo.max = rootScaleFreq * 1.005;
      }
    }

    const scaleKey = `${global.rootNote}-${global.scale}`;
    if (scaleKey === this.lastScaleKey) return;
    this.lastScaleKey = scaleKey;

    const notes = scaleNotes.length > 0 ? scaleNotes.slice(0, 3) : ['C4', 'E4', 'G4'];
    for (const [streamId, nodes] of this.channelNodes) {
      if (nodes.mode !== 'pattern') continue;
      const state = this.store.getState();
      const cfg = state.channels[streamId];
      const sampleMode = cfg?.ambientMode === 'sample';
      const hybridSustain = cfg?.behaviorType === 'hybrid' && cfg?.ambientMode === 'sustain';
      nodes.pattern.values = expandArpShape(notes, cfg?.patternType ?? 'skip');
      if (sampleMode) {
        if (nodes.pattern.state === 'started') {
          nodes.pattern.stop();
          nodes.pattern.cancel();
        }
        continue;
      }
      if (
        hybridSustain &&
        nodes.hybridSustainSynth &&
        nodes.hybridSustainFreq !== null
      ) {
        nodes.hybridSustainSynth.frequency.setValueAtTime(rootScaleFreq, Tone.now());
        nodes.hybridSustainFreq = rootScaleFreq;
      }
      if (hybridSustain && nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
        continue;
      }
      if (nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
        nodes.pattern.start();
      }
    }
  }

  // --- Data point handling ---

  handleDataPoint(dataPoint: DataPoint) {
    // Notify UI listeners
    for (const [, entry] of this.dataListeners) {
      if (entry.streamId === dataPoint.streamId || entry.streamId === '*') {
        entry.listener(dataPoint);
      }
    }

    const { channels, global } = this.store.getState();
    const config = channels[dataPoint.streamId];
    if (!config || !config.enabled) return;
    const processed = this.applyPreMapFilters(dataPoint, config);
    this.lastDataPointByStream.set(dataPoint.streamId, processed);

    const nodes = this.channelNodes.get(dataPoint.streamId);
    if (!nodes) return;
    this.maybeEmitMonitoringBeacon(nodes, processed, config);

    switch (nodes.mode) {
      case 'triggered':
        this.handleTriggered(nodes, processed, config, global);
        break;
      case 'continuous':
        this.handleContinuous(nodes, processed, config, global);
        break;
      case 'pattern':
        this.handlePattern(nodes, processed, config, global);
        break;
    }
  }

  private handleTriggered(
    nodes: TriggeredNodes,
    dataPoint: DataPoint,
    config: ChannelConfig,
    global: GlobalConfig
  ) {
    if (Tone.context.state !== 'running') return;

    const params = this.mappedParams(dataPoint, config, global, 'event');
    this.applyMappedPan(nodes.channel, params.pan);
    if (typeof params.filterCutoff === 'number') {
      nodes.filter.frequency.rampTo(Math.max(50, Math.min(12_000, params.filterCutoff)), 0.05);
    }
    if (typeof params.detune === 'number') {
      nodes.synth.set({ detune: params.detune });
    }

    const probability = Math.max(0, Math.min(1, params.triggerProbability ?? 1));
    if (Math.random() > probability) return;
    if (!this.passesEventThreshold(dataPoint.streamId, config, params)) return;

    const now = Date.now();
    if (!this.passesBurstCap(dataPoint.streamId, now, config.eventBurstCap, config.eventBurstWindowMs)) return;
    const cooldown = config.eventCooldownMs ?? 0;
    const last = this.lastTriggeredAt.get(dataPoint.streamId);
    if (!passesCooldown(now, last, cooldown)) return;
    this.lastTriggeredAt.set(dataPoint.streamId, now);
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;

    // Use scaleIndex to pick a note from the scale, or use frequency directly
    let note: string | number;
    if (params.scaleIndex !== undefined && scaleNotes.length > 0) {
      const idx = Math.floor(params.scaleIndex) % scaleNotes.length;
      note = scaleNotes[idx];
    } else if (params.frequency !== undefined) {
      note = params.frequency;
    } else {
      return;
    }

    const articulation = config.eventArticulation ?? 'neutral';
    const velocity = eventArticulationVelocity(params.velocity ?? 0.5, articulation);
    const dur = this.mappedDuration(params.duration, articulation);
    nodes.synth.triggerAttackRelease(
      note, dur, Tone.now() + Math.random() * 0.02, velocity
    );
  }

  private handleContinuous(
    nodes: ContinuousNodes,
    dataPoint: DataPoint,
    config: ChannelConfig,
    global: GlobalConfig
  ) {
    if (Tone.context.state !== 'running') return;

    const params = this.mappedParams(dataPoint, config, global, 'continuous');
    this.applyMappedPan(nodes.channel, params.pan);

    const entityField = config.entityField ?? 'entityId';
    const entityId = String(dataPoint.fields[entityField] ?? dataPoint.streamId);
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const rootScaleFreq =
      scaleNotes.length > 0 ? Tone.Frequency(scaleNotes[0]).toFrequency() : 440;
    const frequency = typeof params.frequency === 'number'
      ? params.frequency
      : typeof dataPoint.fields.frequency === 'number'
      ? dataPoint.fields.frequency
      : (config.behaviorType === 'ambient' && config.ambientMode === 'sustain'
        ? rootScaleFreq
        : 440);
    const safeFreq = Math.max(20, Math.min(frequency, 2000));

    const existing = nodes.entities.get(entityId);
    if (existing) {
      // Update frequency; ambient streams can glide using smoothingMs.
      const now = Tone.now();
      const smoothingSec = Math.max(0, (config.smoothingMs ?? 0) / 1000);
      if (smoothingSec > 0) {
        const timeConstant = Math.max(0.01, smoothingSec * 0.5);
        existing.synth.frequency.cancelScheduledValues(now);
        existing.synth.frequency.setTargetAtTime(safeFreq, now, timeConstant);
      } else {
        existing.synth.frequency.setValueAtTime(safeFreq, now);
      }
      if (typeof params.detune === 'number') {
        existing.synth.detune.setValueAtTime(params.detune, now);
      }
      existing.lfo.min = safeFreq * 0.995;
      existing.lfo.max = safeFreq * 1.005;
      existing.lastSeen = Date.now();
    } else {
      // Create new drone
      const synth = new Tone.Synth({
        oscillator: (config.synthOptions.oscillator as Record<string, unknown>) ?? { type: 'sine' },
        envelope: (config.synthOptions.envelope as Record<string, number>) ?? {
          attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.8,
        },
      });
      synth.connect(nodes.channel);

      const lfo = new Tone.LFO({
        frequency: 0.1,
        min: safeFreq * 0.995,
        max: safeFreq * 1.005,
      }).connect(synth.frequency);
      lfo.start();

      if (typeof params.detune === 'number') {
        synth.detune.value = params.detune;
      }
      synth.triggerAttack(safeFreq);
      nodes.entities.set(entityId, { synth, lfo, lastSeen: Date.now() });
    }
  }

  private handlePattern(
    nodes: PatternNodes,
    dataPoint: DataPoint,
    config: ChannelConfig,
    global: GlobalConfig
  ) {
    const lane = config.behaviorType === 'hybrid' ? 'hybrid-ambient' : 'ambient';
    const params = this.mappedParams(dataPoint, config, global, lane);
    this.applyMappedPan(nodes.channel, params.pan);
    if (typeof params.detune === 'number') {
      nodes.synth.detune.value = params.detune;
      if (nodes.hybridSustainSynth) {
        nodes.hybridSustainSynth.detune.value = params.detune;
      }
    }
    const smoothingMs = Math.max(0, config.smoothingMs ?? 0);
    const nowMs = Date.now();
    let patternSelectValue = params.patternSelect;
    let noiseVolumeValue = params.noiseVolume;

    if (smoothingMs > 0 && config.behaviorType === 'ambient') {
      const prev = this.patternSmoothingState.get(dataPoint.streamId) ?? { updatedAt: nowMs };
      const dt = Math.max(1, nowMs - prev.updatedAt);
      const alpha = Math.min(1, dt / smoothingMs);
      if (typeof params.patternSelect === 'number') {
        patternSelectValue = prev.patternSelect === undefined
          ? params.patternSelect
          : prev.patternSelect + (params.patternSelect - prev.patternSelect) * alpha;
      }
      if (typeof params.noiseVolume === 'number') {
        noiseVolumeValue = prev.noiseVolume === undefined
          ? params.noiseVolume
          : prev.noiseVolume + (params.noiseVolume - prev.noiseVolume) * alpha;
      }
      this.patternSmoothingState.set(dataPoint.streamId, {
        updatedAt: nowMs,
        patternSelect: patternSelectValue,
        noiseVolume: noiseVolumeValue,
      });
    }

    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const hybridSustain = config.behaviorType === 'hybrid' && config.ambientMode === 'sustain';
    const sampleMode = config.ambientMode === 'sample' && (config.behaviorType === 'ambient' || config.behaviorType === 'hybrid');

    if (sampleMode) {
      if (nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
      }
      if (nodes.hybridSustainSynth && nodes.hybridSustainFreq !== null) {
        nodes.hybridSustainSynth.triggerRelease();
        nodes.hybridSustainFreq = null;
      }
      const driver = this.sampleDriverValue(params);
      const rateMin = Math.max(0.25, config.samplePlaybackRateMin ?? 0.8);
      const rateMax = Math.max(rateMin, config.samplePlaybackRateMax ?? 1.2);
      const playbackRate = rateMin + (rateMax - rateMin) * driver;
      if (nodes.samplePlayer) {
        const nextSrc = this.sampleSourceUrl(config.sampleSource);
        if (nextSrc && nodes.sampleSource !== nextSrc) {
          nodes.sampleSource = nextSrc;
          nodes.samplePlayer.load(nextSrc);
        }
        nodes.samplePlayer.playbackRate = playbackRate;
      }
      if (nodes.sampleFilter) {
        const cutoff = Math.max(200, Math.min(10_000, config.sampleFilterCutoff ?? 2200));
        nodes.sampleFilter.frequency.rampTo(cutoff, 0.08);
      }
      if (nodes.sampleReverb) {
        nodes.sampleReverb.wet.rampTo(Math.max(0, Math.min(1, config.sampleReverbSend ?? 0.25)), 0.08);
      }
      if (nodes.sampleLoop) {
        const density = Math.max(0.2, config.sampleDensity ?? 1.2);
        nodes.sampleLoop.interval = 1 / density;
      }

      if (Tone.context.state === 'running') {
        const transport = Tone.getTransport();
        if (transport.state !== 'started') transport.start();
        if (nodes.sampleLoop && nodes.sampleLoop.state !== 'started') {
          nodes.sampleLoop.start(0);
        }
      }

      if (config.behaviorType === 'hybrid') {
        this.handleHybridAccent(nodes, dataPoint, config, global, patternSelectValue);
      }
      return;
    } else if (nodes.sampleLoop && nodes.sampleLoop.state === 'started') {
      nodes.sampleLoop.stop();
      nodes.sampleLoop.cancel();
    }

    if (hybridSustain) {
      if (nodes.pattern.state === 'started') {
        nodes.pattern.stop();
        nodes.pattern.cancel();
      }
      if (nodes.hybridSustainSynth) {
        let targetFreq = scaleNotes.length > 0
          ? Tone.Frequency(scaleNotes[0]).toFrequency()
          : 440;
        if (typeof params.frequency === 'number') {
          targetFreq = Math.max(20, Math.min(2000, params.frequency));
        } else if (typeof params.scaleIndex === 'number' && scaleNotes.length > 0) {
          const idx = Math.abs(Math.floor(params.scaleIndex)) % scaleNotes.length;
          targetFreq = Tone.Frequency(scaleNotes[idx]).toFrequency();
        }
        const now = Tone.now();
        if (nodes.hybridSustainFreq === null) {
          nodes.hybridSustainSynth.triggerAttack(targetFreq, now);
        } else {
          const timeConstant = Math.max(0.02, Math.max(0, smoothingMs) / 1000);
          nodes.hybridSustainSynth.frequency.cancelScheduledValues(now);
          nodes.hybridSustainSynth.frequency.setTargetAtTime(targetFreq, now, timeConstant);
        }
        nodes.hybridSustainFreq = targetFreq;
      }
    } else {
      if (nodes.hybridSustainSynth && nodes.hybridSustainFreq !== null) {
        nodes.hybridSustainSynth.triggerRelease();
        nodes.hybridSustainFreq = null;
      }

      // Update arpeggio pattern based on temperature/data (with hysteresis)
      if (scaleNotes.length > 0) {
        const rawSelect = patternSelectValue ?? 1;
        const prevPattern = this.patternHysteresis.get(dataPoint.streamId);
        const HYSTERESIS = 0.25; // must cross 0.25 past boundary to switch
        let patternSelect: number;
        if (prevPattern === undefined) {
          patternSelect = Math.floor(rawSelect);
        } else {
          // Only switch if we've moved HYSTERESIS past the integer boundary
          const floored = Math.floor(rawSelect);
          if (floored !== prevPattern) {
            const distPastBoundary = floored > prevPattern
              ? rawSelect - floored     // moving up: distance past the boundary
              : prevPattern - rawSelect; // moving down: distance past the boundary
            patternSelect = distPastBoundary >= HYSTERESIS ? floored : prevPattern;
          } else {
            patternSelect = prevPattern;
          }
        }
        this.patternHysteresis.set(dataPoint.streamId, patternSelect);
        const rootNote = scaleNotes[0]?.slice(0, -1) ?? 'C';
        const octave = parseInt(scaleNotes[0]?.slice(-1) ?? '4');

        let arpNotes: string[];
        if (patternSelect === 0) {
          // Cold — minor feel
          arpNotes = [
            `${rootNote}${octave}`,
            scaleNotes[Math.min(2, scaleNotes.length - 1)],
            scaleNotes[Math.min(4, scaleNotes.length - 1)],
          ];
        } else if (patternSelect === 1) {
          // Moderate
          arpNotes = [
            `${rootNote}${octave}`,
            scaleNotes[Math.min(2, scaleNotes.length - 1)],
            scaleNotes[Math.min(4, scaleNotes.length - 1)],
          ];
        } else {
          // Warm — complex
          arpNotes = [
            scaleNotes[Math.min(1, scaleNotes.length - 1)],
            scaleNotes[Math.min(4, scaleNotes.length - 1)],
            scaleNotes[Math.min(scaleNotes.length - 1, 6)],
          ];
        }
        nodes.pattern.values = expandArpShape(arpNotes, config.patternType ?? 'skip');
      }
    }

    // Update cloud noise
    const noiseVolume = noiseVolumeValue;
    if (noiseVolume !== undefined) {
      if (noiseVolume > -55) {
        if (!nodes.noise) {
          nodes.noiseFilter = new Tone.Filter({
            frequency: 100, type: 'lowpass', rolloff: -48,
          });
          nodes.noiseFilter.connect(nodes.channel);
          nodes.noise = new Tone.Noise('brown').connect(nodes.noiseFilter);
          nodes.noise.start();
        }
        nodes.noise.volume.value = noiseVolume;
      } else if (nodes.noise) {
        nodes.noise.stop();
        nodes.noise.dispose();
        nodes.noise = null;
        nodes.noiseFilter?.dispose();
        nodes.noiseFilter = null;
      }
    }

    // Start pattern + transport if not running
    if (Tone.context.state === 'running') {
      const transport = Tone.getTransport();
      if (transport.state !== 'started') {
        transport.start();
      }
      if (!hybridSustain && nodes.pattern.state !== 'started') {
        nodes.pattern.start();
      }
    }

    if (config.behaviorType === 'hybrid') {
      this.handleHybridAccent(nodes, dataPoint, config, global, patternSelectValue);
    }
  }

  private handleHybridAccent(
    nodes: PatternNodes,
    dataPoint: DataPoint,
    config: ChannelConfig,
    global: GlobalConfig,
    patternSelectValue?: number
  ) {
    if (Tone.context.state !== 'running') return;
    if (!nodes.hybridEventSynth) return;
    const accentKey = `${dataPoint.streamId}:hybrid`;
    const params = this.mappedParams(dataPoint, config, global, 'hybrid-event');
    if (typeof params.filterCutoff === 'number' && nodes.hybridEventFilter) {
      nodes.hybridEventFilter.frequency.rampTo(Math.max(120, Math.min(12_000, params.filterCutoff)), 0.05);
    }
    if (typeof params.detune === 'number') {
      nodes.hybridEventSynth.set({ detune: params.detune });
    }
    const probability = Math.max(0, Math.min(1, params.triggerProbability ?? 1));
    if (Math.random() > probability) return;
    if (!this.passesEventThreshold(accentKey, config, params)) return;

    const now = Date.now();
    if (!this.passesBurstCap(accentKey, now, config.eventBurstCap, config.eventBurstWindowMs)) return;
    const cooldown = config.eventCooldownMs ?? 180;
    const last = this.lastTriggeredAt.get(accentKey);
    if (!passesCooldown(now, last, cooldown)) return;
    this.lastTriggeredAt.set(accentKey, now);

    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    let note: string | number = scaleNotes[0] ?? 'C4';

    if (params.scaleIndex !== undefined && scaleNotes.length > 0) {
      const idx = Math.abs(Math.floor(params.scaleIndex)) % scaleNotes.length;
      note = scaleNotes[idx];
    } else if (params.frequency !== undefined) {
      note = params.frequency;
    } else if (scaleNotes.length > 0 && patternSelectValue !== undefined) {
      const idx = Math.abs(Math.floor(patternSelectValue)) % scaleNotes.length;
      note = scaleNotes[idx];
    }

    const accent = Math.max(0, Math.min(1, config.hybridAccent ?? 0.6));
    const velocityBase = params.velocity ?? 0.55;
    const articulation = config.eventArticulation ?? 'neutral';
    const velocity = eventArticulationVelocity(velocityBase * accent, articulation);
    const dur = this.mappedDuration(params.duration, articulation);
    nodes.hybridEventSynth.triggerAttackRelease(note, dur, Tone.now() + Math.random() * 0.01, velocity);
  }

  private passesEventThreshold(
    streamKey: string,
    config: ChannelConfig,
    params: Partial<Record<string, number>>
  ): boolean {
    const threshold = config.eventTriggerThreshold ?? 0;
    const metric = eventMetricFromParams(params);
    const prev = this.lastEventMetricByStream.get(streamKey);
    if (metric === undefined) {
      this.lastEventMetricByStream.delete(streamKey);
    } else {
      this.lastEventMetricByStream.set(streamKey, metric);
    }
    return passesThreshold(prev, metric, threshold);
  }

  private passesBurstCap(
    streamKey: string,
    now: number,
    burstCap = 0,
    burstWindowMs = 1200
  ): boolean {
    const next = nextBurstHistory(now, this.eventHistoryByStream.get(streamKey), burstCap, burstWindowMs);
    this.eventHistoryByStream.set(streamKey, next.history);
    return next.allowed;
  }

  // Clean up drone entities that haven't been seen recently
  private cleanupStaleEntities() {
    const now = Date.now();

    for (const [streamId, nodes] of this.channelNodes) {
      if (nodes.mode !== 'continuous') continue;
      const config = this.store.getState().channels[streamId];
      // Slow ambient sustain streams should not decay as quickly as fast event-like streams.
      const staleThreshold =
        config?.behaviorType === 'ambient' && config?.ambientMode === 'sustain'
          ? 10 * 60_000
          : 60_000;
      for (const [entityId, entity] of nodes.entities) {
        if (now - entity.lastSeen > staleThreshold) {
          entity.synth.triggerRelease();
          setTimeout(() => {
            entity.synth.dispose();
            entity.lfo.dispose();
          }, 2000); // Let release envelope finish
          nodes.entities.delete(entityId);
        }
      }
    }
  }

  // --- Public API ---

  getChannelAnalyzer(streamId: string): Tone.Analyser | null {
    return this.channelNodes.get(streamId)?.analyzer ?? null;
  }

  getMasterAnalyzer(): Tone.Analyser {
    return this.masterAnalyzer;
  }

  /** Start audio (called after user gesture) */
  start() {
    const state = this.store.getState();
    const scaleNotes = Scale.get(`${state.global.rootNote} ${state.global.scale}`).notes;
    const rootFreq = scaleNotes.length > 0 ? Tone.Frequency(scaleNotes[0]).toFrequency() : 440;
    Tone.getTransport().start();

    // Start pattern channels unless hybrid sustain is selected.
    for (const [streamId, nodes] of this.channelNodes) {
      if (nodes.mode !== 'pattern') continue;
      const config = state.channels[streamId];
      const sampleMode = config?.ambientMode === 'sample';
      const hybridSustain = config?.behaviorType === 'hybrid' && config?.ambientMode === 'sustain';
      if (sampleMode) {
        if (nodes.pattern.state === 'started') {
          nodes.pattern.stop();
          nodes.pattern.cancel();
        }
        if (nodes.sampleLoop && nodes.sampleLoop.state !== 'started') {
          nodes.sampleLoop.start(0);
        }
        continue;
      }
      if (hybridSustain) {
        if (nodes.pattern.state === 'started') {
          nodes.pattern.stop();
          nodes.pattern.cancel();
        }
        if (nodes.hybridSustainSynth && nodes.hybridSustainFreq === null) {
          nodes.hybridSustainSynth.triggerAttack(rootFreq, Tone.now());
          nodes.hybridSustainFreq = rootFreq;
        }
        continue;
      }
      if (nodes.pattern.state !== 'started') {
        nodes.pattern.start();
      }
    }
  }

  dispose() {
    if (this.entityCleanupInterval) {
      clearInterval(this.entityCleanupInterval);
    }

    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    for (const [id, nodes] of this.channelNodes) {
      this.disposeChannel(id, nodes);
    }

    this.masterCompressor.dispose();
    this.masterLimiter.dispose();
    this.masterAnalyzer.dispose();
    this.dataListeners.clear();
    this.lastTriggeredAt.clear();
    this.eventHistoryByStream.clear();
    this.lastEventMetricByStream.clear();
    this.mappingState.clear();
    this.preMapRawPrev.clear();
    this.preMapFilteredPrev.clear();
    this.preMapRollingValues.clear();
    this.preMapHistoryValues.clear();
    this.beaconMetricRangeByStream.clear();
    this.beaconLastMetricByStream.clear();
    this.beaconLastPeriodicAt.clear();
    this.beaconLastEmitAt.clear();
    this.lastDataPointByStream.clear();
    this.patternSmoothingState.clear();
  }
}
