# Phase II Sonification Roadmap

## Purpose
Make stream-to-sound strategy explicit in UI and engine, with distinct behavior for ambient signals (e.g. weather) versus event/time-series signals.

## Progress (March 7, 2026)
- Completed: 1) Ambient DSP Realization (smoothing + sustain quality)
- Completed: 4) Hybrid Dual-Lane Model (separate ambient lane + event accent lane in engine/UI)
- Completed: 3) Event Lane Expansion
  - Completed: cooldown, threshold trigger, burst cap/window, articulation presets (`soft|neutral|punchy`)
  - Completed: tuned per-stream defaults + targeted tests for event shaping behavior
- Completed: 5) Behavior-Aware Mapping UI (v1)
  - Behavior-specific target sets in Mapping Editor (`ambient`, `event`, `hybrid`)
  - Per-row controls implemented and engine-wired: `smoothingMs`, `quantizeStep`, `hysteresis`
  - Event mapping targets now support `duration` and `triggerProbability`
- Completed: 6) Stream Profiling and Filtering (v1)
  - Completed: stream diagnostics in Mapping Editor (update rate, range, missingness)
  - Completed: pre-map filters in UI + engine:
    - rolling window (`mean`/`median`)
    - derivative mode
    - change threshold gate
    - percentile clamp
  - Completed: suggest-mappings bootstrap from live diagnostics
- Completed: 7) Monitoring Semantics (v1)
  - Completed: alert priority tier (`advisory|abnormal|critical`)
  - Completed: auditory beacons:
    - threshold crossing
    - periodic tick
    - new extrema
- Completed: 8) Preset System v2 (v1)
  - Completed: starter preset tags + CPU cost note
  - Completed: A/B compare workflow (`Set A`, `Compare A/B`, `Revert to A`)
  - Completed: integration tests for stream lifecycle stability (idempotent connect, disconnect/dispose cleanup, error state path)

## Current Phase I Status
- Added `behaviorType`: `ambient | event | hybrid`
- Added ambient modes: `arpeggio | sustain` (renamed from loop/drone)
- Added `eventCooldownMs` (active in engine for triggered streams)
- Added `smoothingMs` (stored in config/UI; DSP use is next)

## Design Principles (from Sonification Design book)
- Match representation to data type:
  - Discrete data -> discrete events
  - Continuous data -> continuous soundfields
  - Interactive data -> user-driven exploratory playback
- Manage perceptual load:
  - Long listening should minimize startle/transient density
  - Alerts should be distinct but not cognitively dominating
- Prefer layered sonification:
  - Ambient bed + sparse event beacons
- Stream selection/filtering is a first-class design step:
  - Sonify salient features, not all raw channels
- Keep mapping complexity bounded:
  - Beyond a point, complexity stops being informative

## Phase II Workstreams

### 1) Ambient DSP Realization
- Implement smoothing interpolation for mapped parameters using `smoothingMs`
- Add ambient macro controls:
  - movement
  - texture
  - brightness
  - space
- Ensure `sustain` is continuous/low-fatigue (not just lower gain)

### 2) True Sample Ambient Mode
- Implement actual sample playback path (currently removed from UI)
- Add controls:
  - sample source
  - playback rate range
  - grain/density (optional)
  - filter + reverb send

### 3) Event Lane Expansion
- Extend gating controls:
  - cooldown
  - min inter-onset
  - burst cap/window
  - threshold trigger
- Add event articulation presets:
  - soft
  - neutral
  - punchy

### 4) Hybrid Dual-Lane Model
- Split stream into:
  - ambient lane (continuous/pattern bed)
  - event lane (trigger accents)
- Separate mappings and gains per lane
- Lane tabs in Sonification + Mapping Editor

### 5) Behavior-Aware Mapping UI
- Ambient targets:
  - filter cutoff/Q
  - texture/noise mix
  - modulation depth/rate
  - space/send
- Event targets:
  - note/pitch index
  - velocity
  - duration
  - trigger probability
- Per-row controls:
  - smoothing
  - quantize
  - hysteresis

### 6) Stream Profiling and Filtering
- Add stream diagnostics:
  - update rate
  - range/outliers
  - missingness
- Add pre-map filters:
  - rolling mean/median
  - derivative/change-only
  - threshold gate
  - percentile clamp

### 7) Monitoring Semantics
- Add auditory beacons:
  - threshold crossing
  - new extrema
  - periodic time tick
- Add alert priority tiers:
  - advisory
  - abnormal
  - critical

### 8) Preset System v2
- Tag presets by behavior and listening context
- Add one-line intent + CPU cost note
- Add A/B compare and revert

## Milestones

### Slice 1 (1 week)
- Ambient smoothing DSP
- sustain quality improvements
- event gating expansion

### Slice 2 (1 week)
- Hybrid dual-lane architecture (engine + UI)
- behavior-aware mapping targets

### Slice 3 (1 week)
- Stream profiling/filtering panel
- suggest-mappings bootstrap
- beacon/alert tiers

### Slice 4 (1 week)
- Preset v2 (tags, A/B, revert)
- performance stabilization and integration tests

## Completion Notes (March 7, 2026, later)
- Added true sample ambient mode with explicit controls:
  - source, playback-rate min/max, density, filter cutoff, reverb send
- Added event-shaping unit tests and centralized event-shaping utilities.
- Added performance smoke coverage for mapping engine throughput.
- Added preset normalization for single-active-stream workflow consistency.

## Acceptance Criteria
- Behavior type changes immediately alter stream behavior
- Ambient smoothing audibly reduces jitter
- Event controls audibly shape density without clipping
- Hybrid can run bed + events together per stream
- No runtime crashes during behavior/synth/mode switching
- Presets reliably round-trip behavior settings
