---
title: "fix: Rewrite iOS SonificationEngine for proper synthesis"
type: fix
date: 2026-03-08
---

# Rewrite iOS SonificationEngine for Proper Synthesis

## Overview

The iOS `SonificationEngine` currently uses raw `DynamicOscillator` nodes with manual `Task.sleep` amplitude stepping to simulate envelopes. This produces audible clicks, monophonic note-killing, and a harsh/shrill sound compared to the web Tone.js engine which uses proper ADSR envelopes, polyphonic synths, effects chains, and master bus dynamics.

The fix: rebuild the engine using AudioKit's actual synthesis primitives (`DunneAudioKit.Synth` for polyphony + pattern, `AmplitudeEnvelope` for drones, master `DynamicRangeCompressor` + `PeakLimiter`) and port the web engine's signal chain architecture.

## Problem Statement

The current iOS engine has seven fundamental gaps vs the web engine:

1. **No real envelope** -- `Task.sleep` amplitude stepping at ~ms resolution on the main thread vs audio-rate ADSR at 44.1kHz. Causes clicking at every amplitude transition.
2. **Monophonic** -- Single `DynamicOscillator` per channel. New notes kill previous ones mid-release.
3. **No master bus processing** -- Raw oscillators can clip. Web has `Compressor(-24, 4:1) -> Limiter(-1dB)`.
4. **No scale awareness** -- Hardcoded C major pentatonic. Ignores `global.rootNote` and `global.scale`.
5. **No per-entity drones** -- All flight data writes to one oscillator. Web creates one `Synth + LFO` per flight.
6. **Wrong mapping targets** -- iOS maps to `frequency`/`amplitude`. Web maps to `scaleIndex`/`velocity`. Different sonic behavior.
7. **No effects** -- Config stored but never applied. Web builds per-channel insert chains.

Additionally, the mapping engine's exponential curve implementation differs between platforms: iOS uses `(pow(10, t) - 1) / 9` (base-10 exponential) while web uses `Math.pow(normalized, 2)` (quadratic). Same config produces different sonic behavior.

## Proposed Solution

Use `DunneAudioKit.Synth` for both triggered and pattern modes (polyphonic, built-in ADSR, avoids AmplitudeEnvelope re-trigger issues), `DynamicOscillator + AmplitudeEnvelope` for continuous drones, with a proper master bus. Phased rollout: Phase 0 for immediate sound quality, Phase 1 for core architecture, Phase 2 for feature parity.

### Architecture

**Master bus:**
```
Mixer (all channels)
  -> DynamicRangeCompressor(threshold: -24, ratio: 4)
  -> PeakLimiter(attackDuration: 0.01, decayDuration: 0.1, preGain: 0)
  -> Fader(gain: 0.891)  // -1dB headroom for inter-sample peaks
  -> engine.output
```

Master volume applied to the mixer (before compression), matching web engine.

**Channel type as discriminated enum (mirrors web's `TriggeredNodes | ContinuousNodes | PatternNodes`):**
```swift
enum ChannelMode: String, Codable {
    case triggered, continuous, pattern
}

enum ChannelNode {
    case triggered(TriggeredChannel)
    case continuous(ContinuousChannel)
    case pattern(PatternChannel)
}
```

All three channel structs share common fields via a `ChannelNodeProtocol`:
```swift
protocol ChannelNodeProtocol {
    var fader: Fader { get }
    var panner: Panner { get }
    var insertEffects: [Node] { get }
    var effectsKey: String { get }
    var synthOptionsKey: String { get }
    var behaviorKey: String { get }
}
```

**Per-mode signal chains:**

```
Triggered:
  DunneAudioKit.Synth (polyphonic, built-in ADSR + filter EG)
    -> [InsertEffects]
    -> Fader (channel volume)
    -> Panner
    -> master mixer

Continuous (per-entity):
  DynamicOscillator + AmplitudeEnvelope + LFO(0.1Hz, +/-0.5%)
    -> entity Mixer
    -> [InsertEffects]
    -> Fader
    -> Panner
    -> master mixer

Pattern:
  DunneAudioKit.Synth (polyphonic — avoids AmplitudeEnvelope re-trigger issues)
    -> [InsertEffects]
    -> Fader
    -> Panner
    -> master mixer
  (sequenced by DispatchSourceTimer on .userInitiated queue)
```

**Channel lifecycle methods** (matching web naming):
- `createChannel(id:config:)` — build node graph for mode
- `updateChannel(id:config:)` — apply config-only changes (volume, pan, envelope)
- `disposeChannel(id:)` — ramp fader to -60dB over 40ms, then tear down nodes

### File Structure (after Phase 1)

```
StreamscapesiOS/Sources/Audio/
  SonificationEngine.swift    -- graph management, reconciliation, data routing
  MusicScale.swift             -- scale computation (rootNote + scale → MIDI notes)
  MappingEngine.swift          -- applyMappings, mapValue, mapping state
  EventShaping.swift           -- shouldTrigger, cooldown, burst cap, threshold
```

## Implementation Phases

### Phase 0: Immediate Sound Quality (~100 lines changed)

The "it doesn't sound terrible anymore" phase. Ship, listen, then decide what else is needed. Addresses gaps 1-4.

#### 0a. Master bus dynamics

- [ ] Add `DynamicRangeCompressor` and `PeakLimiter` between mixer and engine output
- [ ] Add `-1dB` headroom `Fader` after limiter (gain 0.891) for inter-sample peak protection
- [ ] Match web settings: threshold -24dB, ratio 4:1, limiter at 0dBFS (effective -1dB via headroom fader)
- [ ] Master volume applied to mixer level (before compression)
- [ ] `SonificationEngine.swift` — replace `engine.output = mixer` with `mixer -> compressor -> limiter -> headroom fader -> engine.output`

#### 0b. Triggered mode with DunneAudioKit.Synth

- [ ] Replace `DynamicOscillator` with `DunneAudioKit.Synth` for triggered channels
- [ ] Use MIDI-style `play(noteNumber:velocity:channel:)` / `stop(noteNumber:channel:)` API
- [ ] Envelope params from `config.synthOptions.envelope` mapped to Dunne.Synth's `attackDuration`, `decayDuration`, `sustainLevel`, `releaseDuration`
- [ ] Set voice count explicitly to 16 (verify DunneAudioKit default; with burst cap 4/1500ms and ~720ms envelope, up to 8 voices may be active simultaneously)
- [ ] Remove all `Task.sleep` envelope simulation
- [ ] `SonificationEngine.swift`

#### 0c. Scale-aware note generation

- [ ] Port scale logic from web's `@tonaljs/scale`: given `rootNote` (e.g. "C4") + `scale` (e.g. "major pentatonic"), compute an array of MIDI note numbers
- [ ] Support all 12 scale types from `GlobalSettingsView`: major pentatonic, minor pentatonic, major, minor, blues, chromatic, dorian, mixolydian, lydian, phrygian, whole tone, diminished
- [ ] Replace hardcoded `scaleFrequencies` array with dynamic computation
- [ ] Remove `quantizeToScale` method entirely (replaced by scale-index-based lookup)
- [ ] Unit tests verifying output matches web's `@tonaljs/scale` for all 12 scale types
- [ ] New file: `StreamscapesiOS/Sources/Audio/MusicScale.swift`

### Phase 1: Core Architecture

Extract pure-function modules, add channel type system, complete remaining modes.

#### 1a. Extract MappingEngine and EventShaping

- [ ] Move `applyMappings`, `mapValue`, and mapping state to `StreamscapesiOS/Sources/Audio/MappingEngine.swift`
- [ ] Move `shouldTrigger`, cooldown, burst cap, threshold to `StreamscapesiOS/Sources/Audio/EventShaping.swift`
- [ ] Fix exponential curve: change `(pow(10, t) - 1) / 9` to `pow(t, 2)` to match web's `Math.pow(normalized, 2)`
- [ ] Fix mapping state key format: use composite keys `"streamId:index:source->target"` to avoid collisions when multiple mappings target the same param (matches web)
- [ ] These are pure functions with no AudioKit deps — independently testable
- [ ] Unit tests for both modules

#### 1b. Channel type enum + reconciler skeleton

- [ ] Convert `ChannelConfig.mode` from `String` to `enum ChannelMode: String, Codable { case triggered, continuous, pattern }`
- [ ] Define `TriggeredChannel`, `ContinuousChannel`, `PatternChannel` structs conforming to `ChannelNodeProtocol`
- [ ] Define `ChannelNode` enum with associated values
- [ ] Replace `channels: [String: ChannelNode]` dict (using old struct) with new enum-based dict
- [ ] Implement diff-based reconciliation: compare `mode`, `synthType`, `effectsKey`, `behaviorKey`, `synthOptionsKey`, `patternType`
- [ ] Structural changes (mode/synthType/effectsKey/behaviorKey/patternType changed) → `disposeChannel` + `createChannel`
- [ ] Config-only changes (volume, pan, envelope) → `updateChannel` in-place
- [ ] `synthOptionsKey` changed → live-update envelope/oscillator params without teardown (matches web lines 758-775)
- [ ] Graceful disposal: ramp fader to -60dB over 40ms before tearing down nodes (matches web's 40ms fadeout)
- [ ] Muted channels stay in graph with fader silenced (don't tear down — matches web behavior, avoids audio glitches on mute/solo toggle)
- [ ] Add `lastDataPointByStream` cache: store most recent `DataPoint` per stream, re-bootstrap channels on rebuild (prevents silence when toggling channel off/on — web does this at lines 623-626, 727-734)
- [ ] Change `reconcile(store:)` → `reconcile(channels: [String: ChannelConfig], global: GlobalConfig)` to decouple from `AppStore` type (matches web pattern, improves testability)
- [ ] `SonificationEngine.swift`

#### 1c. Mapping target parity

- [ ] Support `scaleIndex` target: map value to index in current scale, resolve to MIDI note number
- [ ] Support `velocity` target: map to 0-127 MIDI velocity for Dunne.Synth, or 0-1 amplitude factor
- [ ] Support `duration` target: control note-off timing for triggered mode
- [ ] Support `pan`, `detune`, `filterCutoff` targets (apply to channel/synth params)
- [ ] Support `triggerProbability` target: stochastic note gating (matches web line 1063)
- [ ] Update `handleDataPoint` to read all mapped targets, not just `frequency`/`amplitude`
- [ ] `SonificationEngine.swift`, `MappingEngine.swift`

#### 1d. Pattern mode with DunneAudioKit.Synth

- [ ] Replace `Task.sleep` arpeggio loop with `DispatchSourceTimer` on `.userInitiated` queue (not `.userInteractive` — that's reserved for UI frame rendering)
- [ ] Use `DunneAudioKit.Synth` for pattern mode (avoids `AmplitudeEnvelope` re-trigger issues where calling `start()` while gate is open is undefined behavior in some AudioKit versions)
- [ ] Set timer leeway to `.milliseconds(1)` for musical timing accuracy (default leeway causes audible drift)
- [ ] Timer interval derived from `global.tempo` BPM (beat subdivision)
- [ ] Each note: `synth.play(noteNumber:velocity:)`, schedule `synth.stop(noteNumber:)` after note duration
- [ ] Pattern note array computed from current scale (updated on global config change)
- [ ] `patternType` (upDown, down, up, random, etc.) controls traversal order
- [ ] Tempo change propagation: when `global.tempo` changes, reschedule timer via `timer.schedule(deadline: .now(), repeating: newInterval, leeway: .milliseconds(1))` — called from `applyGlobalConfig`
- [ ] Timer lifecycle: store timer in `PatternChannel`, cancel in `disposeChannel`. Ensure timer is in resumed state before cancelling (cancelling a suspended DispatchSourceTimer crashes). Add timer dictionary analogous to current `arpeggioTasks`
- [ ] `SonificationEngine.swift`

#### 1e. Continuous mode with AmplitudeEnvelope

- [ ] Use `DynamicOscillator` + `AmplitudeEnvelope` for continuous drone (single entity for now)
- [ ] Smooth frequency glide via `oscillator.$frequency.ramp(to:duration:)` (verify API exists in AudioKit 5.6.4 — alternative: set frequency directly and rely on AudioKit's built-in parameter smoothing)
- [ ] `ambientMode == .sustain`: trigger envelope on, hold indefinitely, update frequency from data
- [ ] Remove the 900Hz `LowPassButterworthFilter` (it attenuates fundamentals above 900Hz)
- [ ] `SonificationEngine.swift`

### Phase 2: Feature Parity (only if needed after Phase 0+1)

#### 2a. Per-entity continuous drones (flights)

- [ ] Create `DynamicOscillator` + `AmplitudeEnvelope` + `LFO(0.1Hz, +/-0.5%)` per flight entity
- [ ] Route all entities through a shared per-channel `Mixer`
- [ ] Entity key from `config.entityField` (default "flightId")
- [ ] Frequency glide using ramp (smooth, not stepped)
- [ ] Entity cap: **6 simultaneous entities** (each = 3 DSP nodes = 18 total; safe on A13). Enforce at creation time — reject new entities when full, don't rely on cleanup
- [ ] Stale entity cleanup: 30-second timeout. On cleanup: call `triggerRelease()`, then schedule disposal after 2 seconds to let release envelope finish (prevents clicks — matches web pattern at lines 1438-1461)
- [ ] Disconnect nodes from mixer before disposal to prevent dangling render graph references
- [ ] `SonificationEngine.swift`

#### 2b. Per-channel effects chain

- [ ] Build insert chain at channel creation (eager, not lazy)
- [ ] Map `ChannelConfig.Effect.type` to AudioKit nodes:
  - `reverb` -> `CostelloReverb` (cheaper CPU than ZitaReverb, simpler params, good enough for this use case)
  - `delay` -> `VariableDelay` or `StereoDelay` (with `delayTime`, `feedback`)
  - `chorus` -> `DunneAudioKit.Chorus` (with `frequency`, `depth`, `delayTime`)
  - `distortion` -> `TanhDistortion` (with `distortion` amount)
  - `filter` -> `MoogLadder` (with `cutoffFrequency`, `resonance`)
  - `compressor` -> `DynamicRangeCompressor` (with `threshold`, `ratio`)
- [ ] Wet/dry via effect's wet parameter; bypass by setting wet to 0
- [ ] Rebuild chain when effects config changes (detected via effectsKey diffing)
- [ ] `SonificationEngine.swift`

#### 2c. Pre-map filter pipeline

- [ ] Port web's `applyPreMapFilters`: rolling window, median/mean statistic, change threshold, derivative mode, percentile clamping
- [ ] Applied before mapping engine, matching web data flow
- [ ] New file: `StreamscapesiOS/Sources/Audio/PreMapFilters.swift`

### Deferred (add only when needed — YAGNI)

These items are not needed for sound quality or core feature parity. Add only if a specific use case demands them:

- **Noise bed** (BrownianNoise for weather texture) — cosmetic, adds CPU cost
- **Hybrid behavior mode** (sustain + accent) — complex, no current UI to configure
- **Sample playback mode** (AudioPlayer for ambient samples) — requires asset pipeline
- **Beacon/monitoring system** (threshold crossing tones) — monitoring feature, not core sonification

## Technical Considerations

### Threading model

**Decision: `@MainActor` for all Phase 0 and Phase 1 work.**

The current engine is `@MainActor`. AudioKit node parameter changes (frequency, amplitude, etc.) are thread-safe — they write to `AUParameter` atomically. Graph setup (connecting/disconnecting nodes) should stay on `@MainActor`.

For triggered mode (Wikipedia), main-thread dispatch is trivial: ≤4 events per 1500ms.

For continuous mode (flights at ~100ms per entity), 120 data points/second on main thread is likely fine but should be profiled. Use `MainActor.run {}` from DispatchSourceTimer callbacks.

**Phase 2 optimization (if profiling shows main-thread contention):** Move `handleDataPoint` to a dedicated serial `DispatchQueue(label: "com.streamscapes.audio", qos: .userInitiated)`. Mapping computation is pure and has no UI deps. AudioKit parameter writes are safe from any thread. Protect the `channels` dictionary with the audio queue.

### DunneAudioKit.Synth voice management

Dunne.Synth allocates voices internally. Set voice count explicitly to **16** at initialization. With Wikipedia's burst cap of 4 per 1500ms and ~720ms total envelope (attack 0.02 + decay 0.3 + release 0.4), up to 8 voices may be active simultaneously. 16 voices provides headroom.

When all voices are in use, DunneAudioKit steals the oldest voice. This is acceptable behavior given the burst cap limits.

For pattern mode (also using Dunne.Synth), monophonic patterns with typical BPM (40-240) will use at most 2-3 voices simultaneously (current note + previous note in release).

### Synth type mapping

`ChannelConfig.synthType` stores web synth types (`"Synth"`, `"PluckSynth"`, `"MembraneSynth"`, `"FMSynth"`, `"AMSynth"`). `DunneAudioKit.Synth` is a single synthesis architecture with no FM/AM/membrane/pluck variants. Options:

1. **Parameter presets** (recommended for Phase 0-1): Map each web synth type to `DunneAudioKit.Synth` parameter presets (different waveform, filter envelope, amplitude envelope settings) that approximate the sonic character.
2. **SoundpipeAudioKit.PluckedString** for `"PluckSynth"` specifically (available in existing deps).
3. Accept sonic differences for now — the primary goal is click-free ADSR, not perfect synth-type parity.

### Pattern timer precision

`DispatchSourceTimer` on a `.userInitiated` queue provides ~1-5ms jitter, acceptable for musical timing at typical BPM ranges (40-240). Set leeway to `.milliseconds(1)`. Do NOT use `Task.sleep` (10-50ms jitter on main thread). For tighter timing in future, consider `AVAudioSourceNode` render callback (runs on audio thread for sample-accurate timing).

### AVAudioSession interruption handling

Register for `AVAudioSession.interruptionNotification` in `start()`. When an interruption ends (`type == .ended`, `options.contains(.shouldResume)`), restart the AudioKit engine. Without this, phone calls or Siri activation will kill audio permanently until the app is relaunched.

### Performance budget

Each continuous entity drone is an `Oscillator + AmplitudeEnvelope + LFO` — approximately 3 DSP nodes. At 6 max entities, that is 18 nodes for flights. Profile on older iOS devices (iPhone SE, A13) to verify CPU headroom.

### AudioKit node lifecycle

- Disconnect nodes from mixer before disposal to prevent dangling render graph references
- Creating new AudioKit nodes while the engine is running can cause brief glitches — use the 40ms volume fadeout before rebuilding channels to mask this
- `DispatchSourceTimer` must be explicitly cancelled (unlike Swift Tasks). Cancel before deallocation. Do not cancel while suspended (crashes).

## Acceptance Criteria

### Phase 0

- [ ] Triggered notes (Wikipedia) play with smooth ADSR envelope — no clicks or pops
- [ ] Multiple triggered notes can overlap (polyphonic)
- [ ] Master compressor/limiter prevents clipping when all streams active
- [ ] Changing global root note and scale produces different note choices

### Phase 1

- [ ] MappingEngine and EventShaping extracted with unit tests
- [ ] Channel type enum with diff-based reconciliation (no unnecessary teardowns)
- [ ] Volume sliders, mute, solo buttons respond in real-time without audio glitches
- [ ] Pattern arpeggio (weather) plays at BPM-synced intervals, not hardcoded 600ms
- [ ] Continuous drones (flights) have smooth frequency, no stepping
- [ ] `scaleIndex`, `velocity`, `triggerProbability` mapping targets produce correct sonic behavior
- [ ] Toggling a channel off/on does not go silent (lastDataPointByStream cache)
- [ ] Changing envelope params updates in real-time without channel teardown (synthOptionsKey diffing)

### Phase 2

- [ ] Each nearby flight produces its own drone with LFO vibrato (capped at 6)
- [ ] Per-channel effects (reverb, delay, chorus, etc.) audibly affect the sound
- [ ] Stale entity cleanup produces smooth fadeout, not clicks

## Dependencies & Risks

- **DunneAudioKit.Synth** is already a project dependency (5.6.1). No new packages needed.
- **Scale computation** requires porting music theory logic. The interval arrays for each scale type are well-documented and small (~20 lines).
- **Risk**: DunneAudioKit.Synth's voice allocator behavior under rapid triggering is untested. Mitigation: burst cap limits already exist in event shaping; voice count set to 16 explicitly.
- **Risk**: Multiple simultaneous flight entity oscillators could exceed CPU budget on older devices. Mitigation: hard cap at 6 entities, enforced at creation time.
- **Risk**: `DispatchSourceTimer` lifecycle management — must be cancelled before deallocation, must not be cancelled while suspended. Mitigation: wrapper type with `deinit` safety, explicit cancel in `disposeChannel`.
- **Risk**: AudioKit's `AmplitudeEnvelope.start()` behavior when gate is already open is undefined in some versions. Mitigation: use `DunneAudioKit.Synth` for pattern mode (built-in voice management handles re-triggering).

## References

### Internal

- Web audio engine (gold standard): `src/lib/audio-engine.ts`
- Web mapping engine: `src/lib/mapping-engine.ts`
- Web event shaping: `src/lib/event-shaping.ts`
- Web stream defaults: `src/streams/defaults.ts`
- Current iOS engine: `StreamscapesiOS/Sources/Audio/SonificationEngine.swift`
- iOS coordinator: `StreamscapesiOS/Sources/Audio/AudioCoordinator.swift`
- iOS channel config: `StreamscapesiOS/Sources/Models/ChannelConfig.swift`
- iOS global config: `StreamscapesiOS/Sources/Models/GlobalConfig.swift`
- iOS store: `StreamscapesiOS/Sources/Store/AppStore.swift`
- AudioKit packages: `StreamscapesiOS/project.yml` (AudioKit 5.6.4, SoundpipeAudioKit 5.6.1, DunneAudioKit 5.6.1)

### External

- [DunneAudioKit Synth docs](https://github.com/AudioKit/DunneAudioKit)
- [SoundpipeAudioKit AmplitudeEnvelope](https://github.com/AudioKit/SoundpipeAudioKit)
- [AudioKit Nodes reference](https://www.audiokit.io/AudioKit/documentation/audiokit/nodes)
