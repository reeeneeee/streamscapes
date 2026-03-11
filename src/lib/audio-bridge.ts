/**
 * Audio Bridge — headless entry point for running the web AudioEngine
 * inside a WKWebView on iOS. No React, no DOM, no UI.
 *
 * Exposes `window.AudioBridge` with methods callable from Swift
 * via `evaluateJavaScript()`.
 *
 * IMPORTANT: All methods must return synchronous primitives (string/number/null).
 * WKWebView's evaluateJavaScript cannot serialize Promises.
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
let engineStarted = false;

/**
 * Try to get the AudioContext into "running" state and start the engine.
 * Handles "suspended" and "interrupted" (iOS-specific) states.
 */
function ensureAudioRunning(): void {
  const ctx = Tone.getContext().rawContext as AudioContext;
  console.log('[AudioBridge] ensureAudioRunning — ctx.state:', ctx.state);

  if (ctx.state === 'running') {
    if (engine && !engineStarted) {
      engineStarted = true;
      engine.start();
      console.log('[AudioBridge] engine.start() called (ctx already running)');
    }
    return;
  }

  // For both "suspended" and "interrupted", try resume
  ctx.resume().then(() => {
    console.log('[AudioBridge] ctx.resume() resolved, state:', ctx.state);
    if (engine && !engineStarted) {
      engineStarted = true;
      engine.start();
      console.log('[AudioBridge] engine.start() called after resume');
    }
  }).catch((e) => {
    console.error('[AudioBridge] ctx.resume() failed:', e);
  });

  // If state is "interrupted", also try creating a fresh context after a delay
  if ((ctx.state as string) === 'interrupted') {
    console.log('[AudioBridge] Context is interrupted — will try fresh context in 500ms');
    setTimeout(() => {
      const currentCtx = Tone.getContext().rawContext as AudioContext;
      if (currentCtx.state !== 'running') {
        console.log('[AudioBridge] Still not running, creating fresh AudioContext');
        try {
          const freshCtx = new AudioContext();
          freshCtx.resume().then(() => {
            console.log('[AudioBridge] Fresh context state:', freshCtx.state);
            if (freshCtx.state === 'running') {
              Tone.setContext(freshCtx);
              if (engine && !engineStarted) {
                engineStarted = true;
                engine.start();
                console.log('[AudioBridge] engine.start() called with fresh context');
              }
            }
          }).catch((e) => {
            console.error('[AudioBridge] Fresh context resume failed:', e);
          });
        } catch (e) {
          console.error('[AudioBridge] Fresh context creation failed:', e);
        }
      }
    }, 500);
  }
}

const AudioBridge = {
  /**
   * Initialize engine with channel + global config from Swift.
   * Called once when the iOS app starts audio.
   * Tone.start() runs async internally but we return synchronously.
   */
  init(channelsJson: string, globalJson: string): string {
    try {
      console.log('[AudioBridge] init() called, parsing JSON...');
      const channels: Record<string, ChannelConfig> = JSON.parse(channelsJson);
      const global: GlobalConfig = JSON.parse(globalJson);
      console.log('[AudioBridge] Parsed', Object.keys(channels).length, 'channels');

      // Create store and engine (synchronous)
      store = new BridgeStore({ channels, global, isPlaying: true });
      console.log('[AudioBridge] BridgeStore created');

      engine = new AudioEngine(store);
      engineStarted = false;
      console.log('[AudioBridge] AudioEngine created');

      // Try to start audio via Tone.start()
      Tone.start()
        .then(() => {
          console.log('[AudioBridge] Tone.start() resolved');
          ensureAudioRunning();
        })
        .catch((e) => {
          console.error('[AudioBridge] Tone.start() failed:', e);
          // Try starting anyway
          ensureAudioRunning();
        });

      // Retry after 1s in case Tone.start() is slow
      setTimeout(() => {
        console.log('[AudioBridge] 1s retry check');
        ensureAudioRunning();
      }, 1000);

      // Retry after 3s as final fallback
      setTimeout(() => {
        console.log('[AudioBridge] 3s retry check');
        ensureAudioRunning();
      }, 3000);

      return 'ok';
    } catch (e) {
      console.error('[AudioBridge] init error:', e);
      return `error: ${e}`;
    }
  },

  /**
   * Called from the HTML tap handler with a gesture-unlocked AudioContext.
   * This is the ONLY way to get audio working in WKWebView on iOS —
   * the AudioContext must be created/resumed inside a real user gesture.
   */
  unlockWithContext(ctx: AudioContext): string {
    try {
      console.log('[AudioBridge] unlockWithContext — ctx.state:', ctx.state);
      Tone.setContext(ctx);
      console.log('[AudioBridge] Tone context replaced with gesture-unlocked context');

      // Now start Tone and the engine
      Tone.start().then(() => {
        console.log('[AudioBridge] Tone.start() resolved after unlock, state:', ctx.state);
        ensureAudioRunning();
      }).catch((e) => {
        console.error('[AudioBridge] Tone.start() failed after unlock:', e);
        // Try anyway
        ensureAudioRunning();
      });

      // Also try immediately
      ensureAudioRunning();

      return 'ok';
    } catch (e) {
      console.error('[AudioBridge] unlockWithContext error:', e);
      return `error: ${e}`;
    }
  },

  /**
   * Force-start audio context. Fallback for programmatic resume attempts.
   */
  forceStart(): string {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      console.log('[AudioBridge] forceStart() called, ctx.state:', ctx.state);
      if (ctx.state === 'running') {
        ensureAudioRunning();
        return 'already-running';
      }
      ctx.resume().catch(() => {});
      Tone.start().then(() => ensureAudioRunning()).catch(() => ensureAudioRunning());
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
  resume(): string {
    try {
      engineStarted = false;
      Tone.start()
        .then(() => ensureAudioRunning())
        .catch(() => ensureAudioRunning());
      return 'ok';
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
    engineStarted = false;
    return 'ok';
  },

  /**
   * Minimal beep test — plays a 440Hz sine wave for 0.5s.
   * If you can't hear this, WKWebView audio is fundamentally broken.
   */
  test(): string {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      console.log('[AudioBridge] test() — ctx.state:', ctx.state, 'sampleRate:', ctx.sampleRate);

      // Try resuming first
      ctx.resume().then(() => {
        console.log('[AudioBridge] test() — after resume, ctx.state:', ctx.state);
      }).catch((e) => console.error('[AudioBridge] test() resume error:', e));

      // Method 1: Raw Web Audio API (bypasses Tone.js entirely)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      console.log('[AudioBridge] test() — raw oscillator started');

      // Method 2: Also try with a fresh AudioContext
      try {
        const fresh = new AudioContext();
        console.log('[AudioBridge] test() — fresh ctx state:', fresh.state);
        fresh.resume().then(() => {
          console.log('[AudioBridge] test() — fresh after resume:', fresh.state);
          const osc2 = fresh.createOscillator();
          const gain2 = fresh.createGain();
          osc2.frequency.value = 880;
          gain2.gain.value = 0.3;
          osc2.connect(gain2);
          gain2.connect(fresh.destination);
          osc2.start();
          osc2.stop(fresh.currentTime + 0.5);
          console.log('[AudioBridge] test() — fresh oscillator started');
        }).catch((e) => console.error('[AudioBridge] test() fresh resume error:', e));
      } catch (e) {
        console.error('[AudioBridge] test() fresh ctx error:', e);
      }

      return JSON.stringify({ ctxState: ctx.state });
    } catch (e) {
      return `error: ${e}`;
    }
  },

  /**
   * Check audio context state (for debugging from Swift).
   */
  status(): string {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const ctxState = ctx.state;
      const hasEngine = engine !== null;
      const sampleRate = ctx.sampleRate;
      const channelCount = ctx.destination.channelCount;
      return JSON.stringify({ ctxState, hasEngine, engineStarted, sampleRate, channelCount });
    } catch (e) {
      return `error: ${e}`;
    }
  },
};

// Expose globally so Swift can call via evaluateJavaScript
(window as unknown as Record<string, unknown>).AudioBridge = AudioBridge;

console.log('[AudioBridge] Module loaded, AudioBridge on window');
