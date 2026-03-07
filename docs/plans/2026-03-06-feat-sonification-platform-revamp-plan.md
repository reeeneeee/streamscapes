---
title: "feat: Revamp Streamscapes into a modular sonification platform"
type: feat
date: 2026-03-06
---

# Revamp Streamscapes into a Modular Sonification Platform

## Overview

Transform Streamscapes from a single-page app with 3 hardcoded data streams into a configurable sonification system where data streams can be added, tuned into sound with flexible mappings, and mixed with professional controls.

The focus is the **core sonification experience**: streams, mappings, synths, effects, and mixer. User accounts, preset sharing, and marketplace are deferred until the core system works well.

### Key User Story

A musician opens the app, enables 3-5 data streams, picks synth types, maps data fields to audio parameters, adds effects, dials in a mix, and listens to a rich generative soundscape driven by real-time data.

## Problem Statement

The current app has:
- 3 hardcoded streams with no way to add more
- No configurable mappings (each stream has hardcoded sonification logic)
- No shared audio bus, no effects, no mixer
- All state via prop-drilling (`useState` in `Main.tsx`)
- Critical bugs: P5.js recreation 10x/sec, cloud noise memory leak, duplicate SSE, API key exposure
- Zero tests

## Proposed Solution

Two phases:
1. **Phase 1**: Fix bugs, secure API keys, build the core architecture (plugin system, AudioEngine, Zustand store)
2. **Phase 2**: Sonification mapping UI, mixer, effects, additional streams

Presets saved to `localStorage` for now. Auth, database, sharing come later once the sonification UX is solid.

### Architecture

```
+----------------+    +----------------------------------------+
|  Data Sources  |    |         Web Studio (Client)             |
|                |    |                                         |
| - Weather API  +--->+  Stream       Mapping      Mixer       |
| - Flight API   |    |  Plugins      Engine       (Tone.js    |
| - Wiki SSE     |    |  (data only)  (pure fn)    Channel)    |
| - (more later) |    |                                         |
+-------+--------+    |  Visualizer   localStorage              |
        |              |  (Canvas)     presets                   |
        |              +-----+------+-----------+---------------+
        |                    |      |           |
        |              +-----v------v-+   +-----v-----------+
        |              | Zustand Store |   | AudioEngine     |
        |              | (config only) |   | (Tone.js refs,  |
        |              +--------------+   |  singleton)      |
        |                                  +-----------------+
```

**Key architectural decision**: Tone.js node references live in the `AudioEngine` singleton, NOT in Zustand. Zustand holds declarative config (volume, pan, synth type, mappings). AudioEngine subscribes to store changes and imperatively updates Tone.js nodes. This is the Reconciler pattern.

## Core Types

Start with practical types. Keep them loose where the UX hasn't been validated yet — tighten later.

```typescript
// src/types/stream.ts

interface DataPoint {
  readonly streamId: string;
  readonly timestamp: number;
  readonly fields: Record<string, number | string | boolean>;
}

interface StreamPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'environment' | 'information' | 'financial' | 'social';
  connect(signal: AbortSignal): AsyncIterable<DataPoint>;
}

// src/types/sonification.ts

type MappingCurve = 'linear' | 'logarithmic' | 'exponential' | 'step';

interface SonificationMapping {
  readonly sourceField: string;
  readonly targetParam: string; // e.g. 'frequency', 'velocity', 'filterCutoff'
  readonly curve: MappingCurve;
  readonly inputRange: [number, number];
  readonly outputRange: [number, number];
  readonly invert: boolean;
}

type SynthType = 'Synth' | 'FMSynth' | 'AMSynth' | 'PluckSynth' | 'MembraneSynth' | 'NoiseSynth';

type EffectType = 'reverb' | 'delay' | 'chorus' | 'distortion' | 'filter' | 'compressor';

interface EffectConfig {
  readonly type: EffectType;
  readonly wet: number;
  readonly bypass: boolean;
  readonly params: Record<string, number>;
}

interface ChannelConfig {
  readonly streamId: string;
  readonly synthType: SynthType;
  readonly synthOptions: Record<string, unknown>;
  readonly mappings: readonly SonificationMapping[];
  readonly effects: readonly EffectConfig[];
  readonly volume: number; // dB
  readonly pan: number; // -1 to 1
  readonly mute: boolean;
  readonly solo: boolean;
}

interface GlobalConfig {
  readonly rootNote: string; // e.g. 'C4'
  readonly scale: string; // e.g. 'major pentatonic'
  readonly tempo: number;
  readonly masterVolume: number;
}
```

**Design notes from review:**
- `targetParam` is `string` not a fixed union — lets us discover what params users actually want before locking down the type
- `synthOptions` is `Record<string, unknown>` — validated at runtime, avoids the decorrelated discriminated union problem the reviewers flagged
- No versioned presets yet — just JSON in localStorage, schema will stabilize before we add persistence

## State Management

Single Zustand store, flat shape, minimal middleware:

```typescript
// src/store/index.ts
// Middleware: persist(subscribeWithSelector(storeFn))

interface StreamscapesStore {
  // Audio config
  isPlaying: boolean;
  global: GlobalConfig;
  channels: Record<string, ChannelConfig>;

  // Stream state
  activeStreams: Record<string, { status: 'connecting' | 'connected' | 'error'; error?: string }>;

  // UI
  selectedChannelId: string | null;

  // Actions
  updateChannel(streamId: string, partial: Partial<ChannelConfig>): void;
  updateGlobal(partial: Partial<GlobalConfig>): void;
  toggleStream(streamId: string): void;
}
```

No slices, no immer. `persist` middleware saves channel configs and global config to localStorage. `subscribeWithSelector` enables the AudioEngine to subscribe to specific channel changes.

## Audio Routing

```
Per-stream:
  [Synth] -> [Insert FX chain (max 4)] -> [Tone.Channel (vol/pan/mute)]
                                                 |
                                                 +-> [Master Bus]

Master bus:
  [Tone.Compressor] -> [Tone.Limiter] -> [Tone.Destination]
                                               |
                                         [Tone.Analyser] (viz)
```

Send/return buses deferred. Start with insert effects only — simpler, and sufficient for the initial UX.

## AudioEngine

```typescript
// src/lib/audio-engine.ts

interface AudioEngineStore {
  getState(): Pick<StreamscapesStore, 'channels' | 'global' | 'isPlaying'>;
  subscribe: <T>(
    selector: (state: StreamscapesStore) => T,
    listener: (curr: T, prev: T) => void,
    options?: { equalityFn?: (a: T, b: T) => boolean }
  ) => () => void;
}

class AudioEngine {
  private channels = new Map<string, Tone.Channel>();
  private synths = new Map<string, Tone.Synth>();
  private effects = new Map<string, Tone.Effect[]>();

  constructor(store: AudioEngineStore) {
    // Subscribe to channel config changes, diff and apply to Tone.js nodes
    // Subscribe to global config changes (master volume, tempo)
  }

  dispose(): void {
    // Clean up all Tone.js nodes
  }
}
```

Depends on a store interface, not the hook — testable without React.

## Mapping Engine

Pure function, no class, no state:

```typescript
// src/lib/mapping-engine.ts

function applyMappings(
  dataPoint: DataPoint,
  mappings: readonly SonificationMapping[],
  globalConfig: GlobalConfig
): Partial<Record<string, number>> {
  // For each mapping, extract source field value, apply curve, map to output range
  // Returns e.g. { frequency: 440, velocity: 0.8 }
}
```

`Partial` return type — only mapped params have values. Reviewers caught this.

## Data Flow (end-to-end)

```
1. User enables a stream in the UI
2. Store: activeStreams[streamId] = { status: 'connecting' }
3. StreamManager calls plugin.connect(abortSignal)
4. AsyncIterable yields DataPoint
5. For each DataPoint:
   a. applyMappings(dataPoint, channel.mappings, global) -> param values
   b. AudioEngine receives param values, triggers synth note or updates params
6. User disables stream -> AbortController.abort() -> iterator cleanup
```

This was flagged as missing by the architecture reviewer. The `StreamManager` is a thin orchestrator that lives alongside the AudioEngine — not a React component.

---

## Phase 1: Foundation

**Goal**: Fix critical bugs, secure API keys, build core architecture, get 3 existing streams working through the new system.

### Bug Fixes
- [x] Fix P5.js recreation — remove `flights` from useEffect deps, read from ref in `draw()` — `Visualizer.tsx:416`
- [x] Fix cloud noise leak — store refs to Noise/Filter, dispose before recreating — `WeatherSynth.tsx:9-22`
- [x] Fix duplicate SSE — single EventSource, share data via store — `Visualizer.tsx:68`, `WikiSynth.tsx:68` (resolved: old components no longer rendered)
- [x] Decouple FlightSynth audio updates from React renders — use refs for Tone.js, throttle state updates to 1/sec (resolved: AudioEngine handles audio outside React)
- [x] Remove unused imports (`Chord`, `Interval`, `Note`), dead code, `console.log` statements
- [ ] Remove `any` types (13 instances)

### Security
- [x] Move weather API calls to `/api/streams/weather` (key stays server-side)
- [x] Move flight API calls to `/api/streams/flights` (key stays server-side)
- [x] Switch wiki-stream from Edge to Node.js runtime (Edge has 30s timeout on Vercel)
- [x] Add server-side filtering to wiki-stream SSE (only forward en.wikipedia.org edits, ~90% bandwidth reduction)
- [x] Remove URL parameter overrides (`clouds`, `feels_like`) or gate behind `NODE_ENV === 'development'`
- [x] Add basic security headers to `next.config.ts` (CSP, X-Frame-Options)

### Architecture
- [x] Define types: `DataPoint`, `StreamPlugin`, `ChannelConfig`, `EffectConfig`, `GlobalConfig` — `src/types/`
- [x] Install Zustand, create flat store with `persist` + `subscribeWithSelector` — `src/store/index.ts`
- [x] Create `AudioEngine` class (depends on store interface, not React) — `src/lib/audio-engine.ts`
- [x] Create `StreamManager` (connects/disconnects plugins, feeds data to AudioEngine) — `src/lib/stream-manager.ts`
- [x] Create `applyMappings` pure function — `src/lib/mapping-engine.ts`
- [x] Extract WeatherSynth into `WeatherStreamPlugin` (data only) — `src/streams/weather.ts`
- [x] Extract FlightSynth into `FlightStreamPlugin` (data only) — `src/streams/flights.ts`
- [x] Extract WikiSynth into `WikiStreamPlugin` (data only) — `src/streams/wikipedia.ts`
- [x] Create default mappings for each stream (replicate current sonification behavior)
- [x] Add `visibilitychange` handler — suspend AudioContext when tab hidden
- [x] Replace axios with fetch (only used in 2 places, saves ~14KB)
- [x] Move `@types/p5` to devDependencies, remove unused `wikimedia-streams`
- [ ] Import tonal subpackages directly instead of barrel import

### Tests
- [ ] Unit tests for `applyMappings` (all curve types, edge cases)
- [ ] Unit tests for stream plugin `connect()` methods (mock data, abort signal)
- [ ] Integration test: DataPoint -> mapping -> AudioEngine receives correct params

**Success criteria**: All 3 streams work through the new plugin + mapping + AudioEngine pipeline. Streams can be toggled on/off. API keys are server-side. Critical bugs fixed. No audio leaks after 1 hour of listening.

---

## Phase 2: Sonification Controls + Mixer UI

**Goal**: The UI that makes configuring sonifications feel great.

### Mixer
- [x] Build mixer panel: channel strips with volume fader, pan knob, mute/solo — `src/components/Mixer.tsx`
- [x] Build VU meters using refs + rAF + direct canvas (NOT through Zustand) — `src/components/VUMeter.tsx`
- [x] Implement solo logic in AudioEngine (mute all non-soloed channels when any is soloed)
- [x] Master volume control
- [x] Stream browser/toggle panel — `src/components/StreamBrowser.tsx`

### Sonification Panel
- [x] Per-stream synth type selector — `src/components/SonificationPanel.tsx`
- [x] Per-stream envelope knobs (attack, decay, sustain, release)
- [x] Per-stream insert effects chain (add/remove/reorder, max 4) — `src/components/EffectsChain.tsx`
- [x] Global controls: root note, scale, tempo — `src/components/GlobalControls.tsx`

### Mapping Editor
- [x] Visual mapping editor: pick source data field, pick target audio param, set curve + range — `src/components/MappingEditor.tsx`
- [x] Show available fields from each stream's DataPoint
- [ ] Preview mapped values in real-time as data arrives

### Presets (localStorage only)
- [x] Save current config to localStorage with a name
- [x] Load saved configs
- [x] Delete saved configs
- [x] Export/import as JSON file (for manual sharing)

### Additional Streams
- [x] RSS/Atom feed stream plugin — `src/streams/rss.ts`
- [x] Cryptocurrency price stream plugin — `src/streams/crypto.ts`

### Polish
- [ ] Replace P5.js with Canvas 2D for visualization
- [x] Register with Media Session API for background audio (10 lines of code)
- [ ] Responsive layout pass (collapsible mixer on mobile)
- [x] Add `visibilitychange` handler to suspend/resume AudioContext

**Success criteria**: Users can configure synth type, mappings, and effects per stream. Mixer provides volume/pan/mute/solo with VU meters. Configs persist across page reloads. At least 5 data streams available.

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| AudioEngine reconciliation is complex | Start simple: only handle volume/pan/mute changes, add synth swapping and effects later |
| Mapping UX is confusing for non-musicians | Default mappings that sound good out of the box, advanced editor is optional |
| Too many AudioNodes on mobile | Cap insert effects at 4/channel, limit to ~200 nodes total |
| Long session memory leaks | AudioEngine dispose registry, fix all current leaks first, test 1-hour sessions |
| P5.js replacement is a lot of work | Keep current P5.js working in Phase 1, replace in Phase 2 |

## Deferred (revisit after Phase 2)

- User accounts (Auth.js + Supabase)
- Preset sharing/community gallery
- Server-side audio streaming
- Marketplace / monetization
- Native mobile app
- MIDI input
- Send/return buses (insert effects are enough for now)
- Custom user-provided stream URLs (need SSRF protection)
- GDPR compliance

## References

### Internal
- `src/components/Main.tsx` — current orchestrator
- `src/components/FlightSynth.tsx` — most complex stream (375 lines)
- `src/components/WeatherSynth.tsx` — cloud noise leak, Transport singleton
- `src/components/WikiSynth.tsx` — SSE with no reconnection
- `src/components/Visualizer.tsx` — P5.js recreation bug, duplicate SSE
- `src/app/api/wiki-stream/route.ts` — Edge runtime SSE proxy

### External
- [Tone.js v15](https://tonejs.github.io/)
- [Tone.js Channel](https://tonejs.github.io/docs/15.0.4/classes/Channel.html)
- [Zustand](https://github.com/pmndrs/zustand)
- [Tonal.js](https://github.com/tonaljs/tonal)
- [Media Session API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
