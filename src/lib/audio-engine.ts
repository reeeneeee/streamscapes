import * as Tone from 'tone';
import type { ChannelConfig, GlobalConfig, SynthType } from '@/types/sonification';
import type { DataPoint } from '@/types/stream';
import { applyMappings } from './mapping-engine';
import { Scale } from 'tonal';

// --- Types ---

interface TriggeredNodes {
  mode: 'triggered';
  synth: Tone.PolySynth;
  filter: Tone.Filter;
  channel: Tone.Channel;
  analyzer: Tone.Analyser;
}

interface ContinuousEntity {
  synth: Tone.Synth;
  lfo: Tone.LFO;
  lastSeen: number;
}

interface ContinuousNodes {
  mode: 'continuous';
  entities: Map<string, ContinuousEntity>;
  channel: Tone.Channel;
  analyzer: Tone.Analyser;
}

interface PatternNodes {
  mode: 'pattern';
  synth: Tone.Synth;
  pattern: Tone.Pattern<string>;
  noise: Tone.Noise | null;
  noiseFilter: Tone.Filter | null;
  channel: Tone.Channel;
  analyzer: Tone.Analyser;
}

type ChannelNodes = TriggeredNodes | ContinuousNodes | PatternNodes;

export interface AudioEngineStore {
  getState(): { channels: Record<string, ChannelConfig>; global: GlobalConfig; isPlaying: boolean };
  subscribe: <T>(
    selector: (state: any) => T,
    listener: (curr: T, prev: T) => void,
    options?: { equalityFn?: (a: T, b: T) => boolean }
  ) => () => void;
}

// --- Engine ---

export class AudioEngine {
  private channelNodes = new Map<string, ChannelNodes>();
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;
  private masterAnalyzer: Tone.Analyser;
  private unsubscribers: (() => void)[] = [];
  private store: AudioEngineStore;
  private entityCleanupInterval: ReturnType<typeof setInterval> | null = null;
  // Callbacks for UI data (flights for visualizer, weather display, etc.)
  private dataListeners = new Map<string, (data: DataPoint) => void>();

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
        (state: any) => state.channels,
        (channels: Record<string, ChannelConfig>) => this.reconcileChannels(channels)
      )
    );

    // Subscribe to global config changes
    this.unsubscribers.push(
      store.subscribe(
        (state: any) => state.global,
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

  onData(streamId: string, listener: (data: DataPoint) => void) {
    this.dataListeners.set(streamId, listener);
  }

  offData(streamId: string) {
    this.dataListeners.delete(streamId);
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
      } else if (existing.mode !== config.mode) {
        // Mode changed — rebuild
        this.disposeChannel(id, existing);
        this.createChannel(id, config);
      } else {
        this.updateChannel(existing, config);
      }
    }
  }

  private createChannel(id: string, config: ChannelConfig) {
    const channel = new Tone.Channel({
      volume: config.volume,
      pan: config.pan,
      mute: config.mute,
    });
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

  private createTriggeredChannel(
    id: string,
    config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    const filter = new Tone.Filter({ type: 'highpass', frequency: 50, Q: 1 });
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: (config.synthOptions.oscillator as any) ?? { type: 'sine' },
      envelope: (config.synthOptions.envelope as any) ?? {
        attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1,
      },
    });
    synth.connect(filter);
    filter.connect(channel);

    this.channelNodes.set(id, { mode: 'triggered', synth, filter, channel, analyzer });
  }

  private createContinuousChannel(
    id: string,
    _config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    // Entities (individual drones) are created dynamically as data arrives
    this.channelNodes.set(id, { mode: 'continuous', entities: new Map(), channel, analyzer });
  }

  private createPatternChannel(
    id: string,
    config: ChannelConfig,
    channel: Tone.Channel,
    analyzer: Tone.Analyser
  ) {
    const synth = new Tone.Synth({
      oscillator: (config.synthOptions.oscillator as any) ?? { type: 'sine' },
    });
    synth.connect(channel);

    const { global } = this.store.getState();
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    const initialNotes = scaleNotes.length > 0 ? scaleNotes.slice(0, 4) : ['C4', 'E4', 'G4', 'C5'];

    const pattern = new Tone.Pattern(
      (time, note) => { synth.triggerAttackRelease(note, '8n', time); },
      initialNotes,
      (config.patternType as any) ?? 'upDown'
    );

    this.channelNodes.set(id, {
      mode: 'pattern',
      synth,
      pattern,
      noise: null,
      noiseFilter: null,
      channel,
      analyzer,
    });

    // Start the pattern if transport is running or audio is playing
    if (this.store.getState().isPlaying) {
      Tone.getTransport().start();
      pattern.start();
    }
  }

  private updateChannel(nodes: ChannelNodes, config: ChannelConfig) {
    nodes.channel.volume.value = config.volume;
    nodes.channel.pan.value = config.pan;

    // Solo logic: if any channel is soloed, mute non-soloed channels
    const allChannels = this.store.getState().channels;
    const anySoloed = Object.values(allChannels).some((c) => c.solo);
    nodes.channel.mute = config.mute || (anySoloed && !config.solo);
  }

  private disposeChannel(id: string, nodes: ChannelNodes) {
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
        if (nodes.noise) { nodes.noise.stop(); nodes.noise.dispose(); }
        if (nodes.noiseFilter) { nodes.noiseFilter.dispose(); }
        break;
    }
    nodes.channel.dispose();
    nodes.analyzer.dispose();
    this.channelNodes.delete(id);
  }

  private applyGlobalConfig(global: GlobalConfig) {
    Tone.getDestination().volume.value = global.masterVolume;
    if (global.tempo > 0) {
      Tone.getTransport().bpm.value = global.tempo;
    }
  }

  // --- Data point handling ---

  handleDataPoint(dataPoint: DataPoint) {
    // Notify UI listeners
    const listener = this.dataListeners.get(dataPoint.streamId);
    if (listener) listener(dataPoint);

    const { channels, global } = this.store.getState();
    const config = channels[dataPoint.streamId];
    if (!config || !config.enabled) return;

    const nodes = this.channelNodes.get(dataPoint.streamId);
    if (!nodes) return;

    switch (nodes.mode) {
      case 'triggered':
        this.handleTriggered(nodes, dataPoint, config, global);
        break;
      case 'continuous':
        this.handleContinuous(nodes, dataPoint, config);
        break;
      case 'pattern':
        this.handlePattern(nodes, dataPoint, config, global);
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

    const params = applyMappings(dataPoint, config.mappings, global);
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

    const velocity = params.velocity ?? 0.5;
    nodes.synth.triggerAttackRelease(
      note, '8n', Tone.now() + Math.random() * 0.05, velocity
    );
  }

  private handleContinuous(
    nodes: ContinuousNodes,
    dataPoint: DataPoint,
    config: ChannelConfig
  ) {
    if (Tone.context.state !== 'running') return;

    const entityField = config.entityField ?? 'entityId';
    const entityId = String(dataPoint.fields[entityField] ?? dataPoint.streamId);
    const frequency = typeof dataPoint.fields.frequency === 'number'
      ? dataPoint.fields.frequency : 440;
    const safeFreq = Math.max(20, Math.min(frequency, 2000));

    const existing = nodes.entities.get(entityId);
    if (existing) {
      // Update frequency smoothly
      existing.synth.frequency.setValueAtTime(safeFreq, Tone.now());
      existing.lfo.min = safeFreq * 0.995;
      existing.lfo.max = safeFreq * 1.005;
      existing.lastSeen = Date.now();
    } else {
      // Create new drone
      const synth = new Tone.Synth({
        oscillator: (config.synthOptions.oscillator as any) ?? { type: 'sine' },
        envelope: (config.synthOptions.envelope as any) ?? {
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
    const params = applyMappings(dataPoint, config.mappings, global);

    // Update arpeggio pattern based on temperature/data
    const scaleNotes = Scale.get(`${global.rootNote} ${global.scale}`).notes;
    if (scaleNotes.length > 0) {
      const patternSelect = Math.floor(params.patternSelect ?? 1);
      const rootNote = scaleNotes[0]?.slice(0, -1) ?? 'C';
      const octave = parseInt(scaleNotes[0]?.slice(-1) ?? '4');

      let arpNotes: string[];
      if (patternSelect === 0) {
        // Cold — minor feel
        arpNotes = [
          `${rootNote}${octave}`,
          scaleNotes[Math.min(2, scaleNotes.length - 1)],
          scaleNotes[Math.min(4, scaleNotes.length - 1)],
          `${rootNote}${octave + 1}`,
        ];
      } else if (patternSelect === 1) {
        // Moderate
        arpNotes = [
          `${rootNote}${octave}`,
          scaleNotes[Math.min(2, scaleNotes.length - 1)],
          scaleNotes[Math.min(4, scaleNotes.length - 1)],
          scaleNotes[Math.min(2, scaleNotes.length - 1)],
        ];
      } else {
        // Warm — complex
        arpNotes = [
          scaleNotes[Math.min(1, scaleNotes.length - 1)],
          scaleNotes[Math.min(4, scaleNotes.length - 1)],
          scaleNotes[Math.min(scaleNotes.length - 1, 6)],
          `${rootNote}${octave + 1}`,
        ];
      }
      nodes.pattern.values = arpNotes;
    }

    // Update cloud noise
    const noiseVolume = params.noiseVolume;
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
      if (nodes.pattern.state !== 'started') {
        nodes.pattern.start();
      }
    }
  }

  // Clean up drone entities that haven't been seen recently
  private cleanupStaleEntities() {
    const staleThreshold = 60_000; // 1 minute
    const now = Date.now();

    for (const [, nodes] of this.channelNodes) {
      if (nodes.mode !== 'continuous') continue;
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
    // Start any pattern channels
    for (const [, nodes] of this.channelNodes) {
      if (nodes.mode === 'pattern' && nodes.pattern.state !== 'started') {
        Tone.getTransport().start();
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
  }
}
