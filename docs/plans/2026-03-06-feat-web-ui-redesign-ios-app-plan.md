---
title: "feat: Redesign web UI and build native Swift iOS/iPad app"
type: feat
date: 2026-03-06
---

# Redesign Web UI + Native Swift iOS/iPad App

## Overview

Two parallel tracks:
1. **Web UI redesign**: Visualizer is the primary experience (full-screen canvas), audio controls move to a separate tab/screen. Make it feel like a polished music app.
2. **Native Swift app**: Full iOS/iPad app using AudioKit + SwiftUI, with touch-friendly mixer controls and real-time visualization. Not a PWA.

Both platforms share the same API routes for data streams.

## Problem Statement

The current web UI dumps everything on one page — visualizer, mixer, sonification panel, effects chain, mapping editor, presets, global controls. It looks like a dev tool, not a music app. There is no mobile experience at all.

## Proposed Solution

### Web: Two-View Architecture

```
Tab 1: LISTEN (default)              Tab 2: CONTROLS
┌─────────────────────────────┐      ┌─────────────────────────────┐
│                             │      │ Stream Browser              │
│                             │      │ ─────────────────────────── │
│        Visualizer           │      │ Mixer (channel strips)      │
│        (full canvas)        │      │ ─────────────────────────── │
│                             │      │ Sonification Panel          │
│                             │      │ ─────────────────────────── │
│─────────────────────────────│      │ Effects Chain               │
│ Now Playing bar             │      │ ─────────────────────────── │
│ [stream indicators] [vol]   │      │ Mapping Editor              │
└─────────────────────────────┘      │ ─────────────────────────── │
                                     │ Global Controls / Presets   │
                                     └─────────────────────────────┘
```

The "Listen" tab shows the visualizer full-bleed with a minimal transport bar at the bottom. The "Controls" tab is where all audio configuration lives — mixer, synth selection, mappings, effects, presets.

### iOS: SwiftUI + UIKit Hybrid

```
iPhone                               iPad
┌─────────────┐                      ┌────────────────────────────────────┐
│  Visualizer │                      │                                    │
│  (Canvas)   │                      │           Visualizer               │
│             │                      │           (Canvas)                 │
│             │                      │                                    │
│─────────────│                      │────────────────────────────────────│
│ Transport   │                      │ Transport bar                      │
│ [tab bar]   │                      │ [tab bar or sidebar]               │
└─────────────┘                      └────────────────────────────────────┘

Controls tab (both):
┌─────────────┐                      ┌────────────────────────────────────┐
│ Mixer       │                      │  Mixer faders     │ Sonification   │
│ (vertical   │                      │  (large touch)    │ panel +        │
│  faders)    │                      │                   │ effects +      │
│─────────────│                      │                   │ mappings       │
│ Synth/FX    │                      │                   │                │
│ Mappings    │                      │                   │                │
└─────────────┘                      └────────────────────────────────────┘
```

iPad uses split layout — mixer on left with large 60-80pt touch targets, configuration on right. iPhone stacks vertically with tab navigation.

## Architecture

### Shared (both platforms)

- **API routes** (`/api/streams/*`): Already exist, serve JSON. Both web and iOS clients consume them.
- **Type definitions**: JSON Schema generated from TypeScript types (`DataPoint`, `ChannelConfig`, `GlobalConfig`, `SonificationMapping`). Swift types generated via quicktype.
- **Mapping engine logic**: Pure math (curve functions, range mapping). Reimplemented in Swift as a standalone function — same algorithm, no shared code needed.
- **Store shape**: `ChannelConfig`, `GlobalConfig` structures are the same on both platforms. iOS uses SwiftUI `@Observable` classes mirroring the Zustand store shape.

### Web-Specific

- Tone.js AudioEngine (existing)
- Canvas 2D Visualizer (existing)
- React components + Zustand store (existing)
- Next.js routing for tab navigation

### iOS-Specific

- **AudioKit 5.6** via SPM: `AudioKit`, `SoundpipeAudioKit` (oscillators, filters), `DunneAudioKit` (reverb, effects), `AudioKitUI` (optional for knob/fader views)
- **SwiftUI** for layout, navigation, config panels
- **UIKit** (via `UIViewRepresentable`) for multi-touch mixer faders — SwiftUI gestures can't handle independent simultaneous touches on multiple faders
- **SwiftUI Canvas + TimelineView** for real-time visualization (equivalent to HTML Canvas + rAF)
- **URLSession `bytes(for:)`** for SSE streams, standard URLSession for REST polling

### Audio Engine (iOS)

```
Per-stream (mirrors web):
  [AudioKit Oscillator/Synth] -> [Insert FX chain] -> [Mixer node (vol/pan)]
                                                            |
                                                            +-> [Master bus]

Master bus:
  [Compressor] -> [Limiter] -> [AudioEngine.output]
                                     |
                               [NodeTap] (viz FFT data)
```

The iOS AudioEngine class mirrors the web one — subscribes to store changes, reconciles AudioKit nodes. Same reconciler pattern, different audio framework.

---

## Phase 1: Web UI Redesign

**Goal**: Visualizer front-and-center, controls on a separate view. Polished visual design.

### Tab Navigation

- [x] Add tab state to URL or local state: `'listen' | 'controls'` — `src/app/page.tsx`
- [x] Create tab bar component with two tabs — `src/components/TabBar.tsx`
- [x] "Listen" tab: full-bleed visualizer with minimal transport bar
- [x] "Controls" tab: all existing control components (mixer, sonification, effects, mappings, presets, global, stream browser)
- [x] Keyboard shortcut: `1` for Listen, `2` for Controls

### Listen View

- [x] Visualizer fills available viewport height (CSS `calc(100vh - transport)` or `dvh`)
- [x] Remove `max-w-lg` constraint on canvas — let it be full-width
- [x] Minimal transport bar at bottom: active stream indicators (colored dots), master volume, play/stop
- [x] Show stream status dots with `STREAM_COLORS` — `src/components/TransportBar.tsx`
- [x] "Start Synth" button centered in visualizer area when not playing

### Controls View

- [x] Reuse existing components: Mixer, StreamBrowser, GlobalControls, SonificationPanel, EffectsChain, MappingEditor, Presets
- [x] Reorganize layout — mixer at top (always visible), then accordion sections for the rest
- [x] Mobile: single column, collapsible sections
- [x] Desktop: two-column layout (similar to current but without visualizer taking space)

### Visual Polish

- [x] Refine dark theme: use consistent color palette (not arbitrary hex values scattered across components)
- [x] Define CSS custom properties for theme colors — `src/app/globals.css`
- [x] Typography: use Geist (already loaded) with clear hierarchy — section titles, labels, values
- [x] Slider styling: custom range input styles that match the app aesthetic
- [x] Button states: hover, active, disabled states for mute/solo/stream toggles
- [x] Smooth transitions between tabs

### Cleanup

- [x] Delete legacy components no longer imported: `FlightSynth.tsx`, `WeatherSynth.tsx`, `WikiStream.tsx` (if still present)
- [x] Fix duplicate SSE: Visualizer opens its own EventSource for wiki edits — should use store data instead
- [x] Remove empty `<h4>` tag in Visualizer

**Success criteria**: The app feels like a music listening experience by default. Controls are accessible but not in the way. Works well on mobile browsers.

---

## Phase 2: iOS App Foundation

**Goal**: Xcode project, AudioKit integration, one working stream (weather), basic visualization.

### Project Setup

- [ ] Create Xcode project: `StreamscapesiOS/` at repo root, iOS 17+ target, Swift 6
- [ ] Add SPM dependencies: `AudioKit`, `SoundpipeAudioKit`, `DunneAudioKit`
- [ ] App architecture: `@Observable` store, AudioEngine class, StreamManager
- [ ] Create shared type definitions: `DataPoint`, `ChannelConfig`, `GlobalConfig`, `SonificationMapping` as Swift structs (Codable)

### Data Layer

- [ ] `StreamPlugin` protocol: `func connect() -> AsyncStream<DataPoint>` with task cancellation
- [ ] `WeatherStreamPlugin`: fetch from existing `/api/streams/weather` endpoint (configurable base URL)
- [ ] `FlightStreamPlugin`: fetch from `/api/streams/flights`
- [ ] `WikiStreamPlugin`: SSE from `/api/wiki-stream` using `URLSession.bytes(for:)`
- [ ] `StreamManager`: manages active plugins, feeds data to AudioEngine

### Audio Engine

- [ ] `AudioEngine` class: owns AudioKit engine, mixer nodes, synths, effects
- [ ] Reconciler pattern: subscribes to store changes, diffs config, updates AudioKit nodes
- [ ] Implement `applyMappings()` in Swift — same curve math as web version
- [ ] Support `SynthType` variants: map to AudioKit oscillator types (sine, FM, etc.)
- [ ] Master bus: compressor -> limiter -> output
- [ ] `NodeTap` on master for visualization FFT data

### Mapping Engine (Swift)

- [ ] Pure function: `applyMappings(dataPoint:mappings:globalConfig:) -> [String: Double]`
- [ ] Curve implementations: linear, logarithmic, exponential, step
- [ ] Unit tests (XCTest) mirroring the web mapping-engine tests

### Basic UI (SwiftUI)

- [ ] `TabView` with two tabs: Listen, Controls
- [ ] Listen tab: `Canvas` + `TimelineView` for real-time visualization
- [ ] Controls tab: simple list of channel configs with volume sliders
- [ ] "Start" button to begin audio + streams

**Success criteria**: Weather stream produces sound through AudioKit. Visualizer shows waveform. Volume control works. App runs on simulator and device.

---

## Phase 3: iOS Mixer + Full Controls

**Goal**: Touch-friendly mixer, all 5 streams, effects, full parity with web controls.

### Mixer (UIKit for multi-touch)

- [ ] `MixerViewController` with custom `UIView` faders — `UIViewRepresentable` wrapper
- [ ] 60-80pt wide fader tracks, vertical orientation
- [ ] Independent multi-touch: each finger controls its own fader (using `UITouch` tracking)
- [ ] VU meters per channel: driven by `NodeTap` RMS values, rendered with Core Graphics
- [ ] Mute/Solo buttons per channel
- [ ] Pan knob per channel
- [ ] Master fader + VU meter

### All Streams

- [ ] `RSSStreamPlugin`: fetch from `/api/streams/rss`
- [ ] `StocksStreamPlugin`: fetch from `/api/streams/stocks`
- [ ] Stream browser view: toggle streams on/off

### Sonification Controls

- [ ] Synth type picker per channel
- [ ] Envelope knobs (ADSR) — SwiftUI sliders or AudioKitUI knobs
- [ ] Effects chain: add/remove/reorder (max 4), wet/dry, bypass
- [ ] Global controls: root note picker, scale picker, tempo

### Mapping Editor

- [ ] Source field picker (from stream's DataPoint fields)
- [ ] Target param picker (frequency, velocity, filterCutoff, etc.)
- [ ] Curve selector + range inputs
- [ ] Live preview of mapped values

### iPad Layout

- [ ] `NavigationSplitView`: sidebar for stream list, detail for selected stream's controls
- [ ] Or: Listen tab is full-screen canvas, Controls tab uses `HSplitView` — mixer left, config right
- [ ] Large touch targets throughout (minimum 44pt, prefer 60pt for mixer)

### Presets

- [ ] Save/load configs to `UserDefaults` (JSON-encoded `ChannelConfig` + `GlobalConfig`)
- [ ] Export/import as JSON file via share sheet

**Success criteria**: All 5 streams work. Mixer has multi-touch faders on iPad. Effects and mappings are configurable. Presets persist.

---

## Phase 4: Visualization + Polish

**Goal**: Rich visualization on iOS, visual parity with web, app store readiness.

### Visualization (iOS)

- [ ] Port Canvas 2D visualizer to SwiftUI `Canvas` + `TimelineView`
- [ ] Flight radar: airplane icons positioned by lat/lon offset, rotation from velocity vector
- [ ] Wiki edit ripples: expanding rings with title labels
- [ ] Waveform display: FFT data from `NodeTap`
- [ ] Distance circles around user location
- [ ] Tap gestures: tap flight to open ADSB info, tap wiki edit to open article

### Polish

- [ ] App icon and launch screen
- [ ] Background audio: `AVAudioSession` category `.playback`, background mode capability
- [ ] `MediaPlayer.NowPlayingInfo` integration (lock screen controls)
- [ ] Handle audio interruptions (phone calls, Siri)
- [ ] Handle app lifecycle: pause streams when backgrounded (optional), resume on foreground
- [ ] Accessibility: VoiceOver labels for all controls, Dynamic Type support
- [ ] Haptic feedback on mixer controls (UIImpactFeedbackGenerator)

### Performance

- [ ] Profile with Instruments: ensure < 10% CPU idle, < 50% during active sonification
- [ ] Cap AudioKit nodes: same limits as web (4 effects/channel, ~200 nodes total)
- [ ] Throttle data processing to 60fps for visualization, 10Hz for audio parameter updates

**Success criteria**: App feels native and polished. Visualization matches web quality. Background audio works. Ready for TestFlight.

---

## Shared Data Service Architecture

Both web and iOS clients consume the same API routes:

```
/api/streams/weather   → JSON (polled every 3min)
/api/streams/flights   → JSON (polled every 5s)
/api/wiki-stream       → SSE (Server-Sent Events, persistent connection)
/api/streams/rss       → JSON (polled every 60s)
/api/streams/stocks    → JSON (polled every 30s)
```

iOS streams use the deployed web app URL as the base. For local development, use the Mac's local IP.

### Type Sharing Strategy

```
src/types/stream.ts          ──┐
src/types/sonification.ts     ├──> JSON Schema ──> quicktype ──> Swift structs
                              │
                              └──> (manual for now, automate if types change often)
```

For the initial build, manually write Swift structs matching the TypeScript types. They're small and stable. Add quicktype automation later if types start drifting.

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| AudioKit learning curve | Start with one stream (weather), get sound out first. AudioKit docs + playground. |
| Multi-touch UIKit complexity | Isolate in one `UIViewRepresentable`. Can ship SwiftUI-only faders first (single touch), add UIKit later. |
| SSE on iOS unreliable on cellular | Implement reconnection with exponential backoff. Degrade gracefully if stream disconnects. |
| Canvas visualization performance on older iPhones | Profile early. Reduce draw calls, skip off-screen elements, throttle to 30fps on older devices. |
| API rate limits from mobile clients | Same polling intervals as web. Add `If-Modified-Since` headers where supported. |
| Duplicate wiki SSE (web) | Fix in Phase 1: Visualizer should read wiki data from store, not open its own EventSource. |

## Deferred

- M4L / MIDI output integration
- BYO data streams via WebSocket
- watchOS companion
- Widgets (iOS 17 interactive widgets for stream status)
- App Store submission (TestFlight first)
- Shared preset cloud sync between web and iOS
- CarPlay audio integration

## References

### Internal
- `src/components/Main.tsx` — current orchestrator (single-page layout)
- `src/components/Visualizer.tsx` — Canvas 2D visualizer to port
- `src/lib/audio-engine.ts` — AudioEngine reconciler pattern to mirror
- `src/lib/mapping-engine.ts` — pure mapping function to reimplement in Swift
- `src/types/` — type definitions to share
- `src/app/api/` — API routes consumed by both platforms

### External
- [AudioKit 5.6](https://audiokit.io) — Swift audio framework
- [SoundpipeAudioKit](https://github.com/AudioKit/SoundpipeAudioKit) — oscillators, filters
- [DunneAudioKit](https://github.com/AudioKit/DunneAudioKit) — reverb, effects
- [SwiftUI Canvas](https://developer.apple.com/documentation/swiftui/canvas) — 2D drawing
- [TimelineView](https://developer.apple.com/documentation/swiftui/timelineview) — animation driver
- [URLSession bytes](https://developer.apple.com/documentation/foundation/urlsession/3767353-bytes) — SSE streaming
- [quicktype](https://quicktype.io) — JSON Schema to Swift codegen
