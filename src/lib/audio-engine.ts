import * as Tone from 'tone';
import type { ChannelConfig, GlobalConfig, SynthType } from '@/types/sonification';
import type { DataPoint } from '@/types/stream';
import { applyMappings } from './mapping-engine';

// Synth constructor registry
const SYNTH_CONSTRUCTORS: Record<SynthType, new (options?: any) => Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.MembraneSynth | Tone.NoiseSynth> = {
  Synth: Tone.Synth,
  FMSynth: Tone.FMSynth,
  AMSynth: Tone.AMSynth,
  PluckSynth: Tone.PluckSynth as any,
  MembraneSynth: Tone.MembraneSynth,
  NoiseSynth: Tone.NoiseSynth,
};

interface ChannelNodes {
  synth: Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.MembraneSynth | Tone.NoiseSynth;
  channel: Tone.Channel;
  analyzer: Tone.Analyser;
}

export interface AudioEngineStore {
  getState(): { channels: Record<string, ChannelConfig>; global: GlobalConfig; isPlaying: boolean };
  subscribe: <T>(
    selector: (state: any) => T,
    listener: (curr: T, prev: T) => void,
    options?: { equalityFn?: (a: T, b: T) => boolean }
  ) => () => void;
}

export class AudioEngine {
  private channelNodes = new Map<string, ChannelNodes>();
  private masterCompressor: Tone.Compressor;
  private masterLimiter: Tone.Limiter;
  private masterAnalyzer: Tone.Analyser;
  private unsubscribers: (() => void)[] = [];
  private store: AudioEngineStore;

  constructor(store: AudioEngineStore) {
    this.store = store;

    // Master bus: Compressor -> Limiter -> Destination
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
  }

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
      } else {
        this.updateChannel(existing, config);
      }
    }
  }

  private createChannel(id: string, config: ChannelConfig) {
    const Constructor = SYNTH_CONSTRUCTORS[config.synthType];
    const synth = new Constructor(config.synthOptions as any);
    const channel = new Tone.Channel({
      volume: config.volume,
      pan: config.pan,
      mute: config.mute,
    });
    const analyzer = new Tone.Analyser('waveform', 256);

    synth.connect(channel);
    channel.connect(analyzer);
    analyzer.connect(this.masterCompressor);

    this.channelNodes.set(id, { synth, channel, analyzer });
  }

  private updateChannel(nodes: ChannelNodes, config: ChannelConfig) {
    nodes.channel.volume.value = config.volume;
    nodes.channel.pan.value = config.pan;
    nodes.channel.mute = config.mute;
  }

  private disposeChannel(id: string, nodes: ChannelNodes) {
    nodes.synth.dispose();
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

  /** Feed a data point into the engine to trigger/update audio */
  handleDataPoint(dataPoint: DataPoint) {
    const { channels, global } = this.store.getState();
    const config = channels[dataPoint.streamId];
    if (!config || !config.enabled) return;

    const nodes = this.channelNodes.get(dataPoint.streamId);
    if (!nodes) return;

    const params = applyMappings(dataPoint, config.mappings, global);

    // Apply mapped parameters
    if (params.frequency && 'frequency' in nodes.synth) {
      (nodes.synth as Tone.Synth).triggerAttackRelease(
        params.frequency,
        '8n',
        undefined,
        params.velocity ?? 0.5
      );
    }
  }

  /** Get the analyzer for a specific channel */
  getChannelAnalyzer(streamId: string): Tone.Analyser | null {
    return this.channelNodes.get(streamId)?.analyzer ?? null;
  }

  /** Get the master analyzer */
  getMasterAnalyzer(): Tone.Analyser {
    return this.masterAnalyzer;
  }

  dispose() {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    for (const [id, nodes] of this.channelNodes) {
      this.disposeChannel(id, nodes);
    }

    this.masterCompressor.dispose();
    this.masterLimiter.dispose();
    this.masterAnalyzer.dispose();
  }
}
