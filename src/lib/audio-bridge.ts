/**
 * Audio Bridge — headless entry point for running the web AudioEngine
 * inside a WKWebView on iOS. No React, no DOM, no UI.
 *
 * Exposes `window.AudioBridge` with methods callable from Swift
 * via `evaluateJavaScript()`.
 */
import * as Tone from 'tone';
import { AudioEngine } from './audio-engine';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';
import type { DataPoint } from '@/types/stream';

// ---------------------------------------------------------------------------
// Mini reactive store — satisfies AudioEngine's AudioEngineStore interface
// ---------------------------------------------------------------------------

interface StoreState {
  channels: Record<string, ChannelConfig>;
  global: GlobalConfig;
  isPlaying: boolean;
}

interface Subscription {
  selector: (state: StoreState) => unknown;
  listener: (curr: unknown, prev: unknown) => void;
  lastValue: unknown;
}

class BridgeStore {
  private state: StoreState;
  private subs: Subscription[] = [];

  constructor(initial: StoreState) {
    this.state = initial;
  }

  getState(): StoreState {
    return this.state;
  }

  subscribe<T>(
    selector: (state: StoreState) => T,
    listener: (curr: T, prev: T) => void,
  ): () => void {
    const entry: Subscription = {
      selector: selector as (state: StoreState) => unknown,
      listener: listener as (curr: unknown, prev: unknown) => void,
      lastValue: selector(this.state),
    };
    this.subs.push(entry);
    return () => {
      this.subs = this.subs.filter((s) => s !== entry);
    };
  }

  /** Update state and fire matching subscriptions. */
  setState(partial: Partial<StoreState>): void {
    this.state = { ...this.state, ...partial };
    for (const entry of this.subs) {
      const next = entry.selector(this.state);
      const prev = entry.lastValue;
      if (next !== prev) {
        entry.lastValue = next;
        entry.listener(next, prev);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge singleton
// ---------------------------------------------------------------------------

let store: BridgeStore | null = null;
let engine: AudioEngine | null = null;

const AudioBridge = {
  /**
   * Initialize engine with channel + global config from Swift.
   * Called once when the iOS app starts audio.
   */
  async init(
    channelsJson: string,
    globalJson: string,
  ): Promise<string> {
    try {
      const channels: Record<string, ChannelConfig> = JSON.parse(channelsJson);
      const global: GlobalConfig = JSON.parse(globalJson);

      // Create store and engine
      store = new BridgeStore({ channels, global, isPlaying: true });
      engine = new AudioEngine(store);

      // Start Tone.js audio context + transport
      await Tone.start();
      const ctx = Tone.getContext().rawContext as AudioContext;
      if (ctx.state !== 'running') await ctx.resume();
      engine.start();

      return 'ok';
    } catch (e) {
      return `error: ${e}`;
    }
  },

  /**
   * Update channel and global config. Triggers reconciliation.
   */
  reconcile(channelsJson: string, globalJson: string): string {
    if (!store) return 'not-initialized';
    try {
      const channels: Record<string, ChannelConfig> = JSON.parse(channelsJson);
      const global: GlobalConfig = JSON.parse(globalJson);
      store.setState({ channels, global });
      return 'ok';
    } catch (e) {
      return `error: ${e}`;
    }
  },

  /**
   * Feed a data point to the engine. Called from Swift stream plugins.
   */
  handleDataPoint(dpJson: string): string {
    if (!engine) return 'not-initialized';
    try {
      const dp: DataPoint = JSON.parse(dpJson);
      engine.handleDataPoint(dp);
      return 'ok';
    } catch (e) {
      return `error: ${e}`;
    }
  },

  /**
   * Resume audio context (call after app foregrounding).
   */
  async resume(): Promise<string> {
    try {
      await Tone.start();
      const ctx = Tone.getContext().rawContext as AudioContext;
      if (ctx.state !== 'running') await ctx.resume();
      if (engine) engine.start();
      return Tone.getContext().rawContext.state;
    } catch (e) {
      return `error: ${e}`;
    }
  },

  /**
   * Stop and dispose the engine.
   */
  stop(): string {
    if (engine) {
      engine.dispose();
      engine = null;
    }
    store = null;
    return 'ok';
  },

  /**
   * Check audio context state (for debugging from Swift).
   */
  status(): string {
    try {
      const ctxState = Tone.getContext().rawContext.state;
      const hasEngine = engine !== null;
      return JSON.stringify({ ctxState, hasEngine });
    } catch (e) {
      return `error: ${e}`;
    }
  },
};

// Expose globally so Swift can call via evaluateJavaScript
(window as unknown as Record<string, unknown>).AudioBridge = AudioBridge;
