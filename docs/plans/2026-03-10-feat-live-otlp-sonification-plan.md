---
title: "feat: Live OTLP Sonification — Minimal Viable Slice"
type: feat
date: 2026-03-10
---

# Live OTLP Sonification — Minimal Viable Slice

## Overview

Add live sonification of monitoring data by embedding an OTLP/HTTP ingest endpoint directly into the Streamscapes Next.js server, plus a Datadog API adapter for pulling alerts and spans. No CLI required — configure everything through the app.

Users hear their systems in real-time: span completions as triggered notes (one mixer channel per service), error spans audibly distinct (darker, detuned), with a scrollable toast-style error feed for visual context.

**Platform:** Desktop/laptop only. The web app must be running locally (`next dev` or deployed to a long-running server). Not applicable to iOS.

## Problem Statement / Motivation

Streamscapes currently sonifies external public data streams (weather, flights, Wikipedia, RSS, stocks). The most compelling use case for an observability-minded audience is hearing *their own systems*.

Two complementary ingestion paths:

1. **OTLP direct** — vendor-neutral standard. Anyone with OTel-instrumented services can point an exporter at Streamscapes. Works with Daimon, RAG Ingester, Matrix Auth Service, and any OTel Collector.
2. **Datadog API pull** — for teams already reporting to Datadog. No collector changes needed — Streamscapes queries the Datadog API for recent spans, alerts, and events. Works with Synapse's ddtrace instrumentation and any other DD-monitored service.

## Proposed Solution

Four components, all within the existing Next.js app:

1. **OTLP ingest API route** (`/api/ingest/otlp`) — accepts `POST /v1/traces` (OTLP/HTTP JSON), parses spans, pushes to an in-memory event bus
2. **Datadog API adapter** (`/api/ingest/datadog`) — polls Datadog's API for recent spans/alerts using API + App keys, pushes to the same event bus
3. **SSE relay** (`/api/ingest/stream`) — streams events from the bus to the browser via Server-Sent Events (same pattern as `/api/wiki-stream`)
4. **OTLPStreamPlugin** (browser) — connects to the SSE relay, converts events into `DataPoint` objects, auto-creates channels per service
5. **Error feed** — scrollable toast-style panel showing all recent error spans, with dismiss-all

```
                                    ┌─ OTel SDK / Collector
                                    │    POST /api/ingest/otlp/v1/traces
                                    │
  Next.js server ◄──────────────────┤
  (same process)                    │
        │                           └─ Datadog API (polled)
        │  in-memory event bus           /api/ingest/datadog
        │
        ▼  SSE /api/ingest/stream
  Browser (OTLPStreamPlugin via EventSource)
        │
        ├─► AudioEngine.handleDataPoint() → triggered note
        └─► Error feed (toast list)
```

### Why API Routes Instead of a CLI

- **Zero extra tooling** — no separate terminal process, no `npx`, no WebSocket port management
- **Same pattern as existing streams** — Wikipedia already uses Next.js API route + SSE. OTLP follows the identical architecture.
- **In-app configuration** — Connections panel shows ingest URLs, Datadog API key input, connection status. Everything in one place.
- **Deployable** — on a long-running server (Railway, Fly.io, VPS), the same routes accept OTLP from remote collectors or Datadog webhooks. No architecture change needed for cloud use.

## Technical Approach

### Phase 1: OTLP Ingest API Route

**New files:** `src/app/api/ingest/otlp/v1/traces/route.ts`, `src/lib/otlp-parse.ts`, `src/lib/ingest-bus.ts`

#### Ingest Event Bus (`src/lib/ingest-bus.ts`)

A simple in-memory pub/sub shared between the POST handler and the SSE handler within the same Next.js server process:

```typescript
// Singleton event emitter — lives as long as the server process
// POST routes push SpanMessages; SSE route subscribes and forwards to browser
// Uses globalThis stash to survive HMR during next dev
type Listener = (msg: SpanMessage) => void

class IngestBus {
  private listeners = new Set<Listener>()
  publish(msg: SpanMessage) { this.listeners.forEach(fn => fn(msg)) }
  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  get subscriberCount() { return this.listeners.size }
}

const bus = (globalThis as any).__ingestBus ??= new IngestBus()
export const ingestBus: IngestBus = bus
```

**Important:** All route files that use the bus (`otlp/v1/traces/route.ts`, `datadog/route.ts`, `stream/route.ts`) must set `export const runtime = 'nodejs'` to ensure they run in the same long-lived process. The `globalThis` stash survives HMR during `next dev` (same pattern as `global.prisma`).

#### OTLP Parse (`src/lib/otlp-parse.ts`)

Pure functions to extract `SpanMessage` objects from OTLP JSON payloads:

```typescript
interface SpanMessage {
  serviceName: string               // resource.attributes["service.name"] ?? "unknown"
  spanName: string                  // span.name
  durationMs: number                // (endTimeUnixNano - startTimeUnixNano) / 1e6
  statusCode: number                // span.status.code (0=UNSET, 1=OK, 2=ERROR)
  kind: number                      // span.kind (0-5)
  timestamp: number                 // Date.now()
  errorMessage?: string             // span.status.message (when error)
  httpStatusCode?: number           // span.attributes["http.response.status_code"]
}
```

Walks `resourceSpans[].scopeSpans[].spans[]`, extracts `service.name` from resource attributes, computes duration from nanosecond timestamps. Handles missing fields gracefully.

#### OTLP Route (`src/app/api/ingest/otlp/v1/traces/route.ts`)

```
POST /api/ingest/otlp/v1/traces
  Content-Type: application/json
  Body: ExportTraceServiceRequest (OTLP JSON)
  Response: 200 {}
```

- Parses body via `otlp-parse.ts`
- Publishes each `SpanMessage` to the `ingestBus`
- Returns `200 {}` per OTLP spec
- Returns `400` for unparseable bodies, `415` for unsupported content types
- `export const runtime = 'nodejs'` (required for shared singleton)

**OTLP path convention:** The OTel Collector appends `/v1/traces` to the configured endpoint. By nesting the route at `/api/ingest/otlp/v1/traces`, the user configures their exporter endpoint as `http://localhost:3000/api/ingest/otlp` and the Collector automatically hits the right path.

**JSON-only for MVP.** Users must set `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` or configure their Collector exporter with `encoding: json`. Phase 2 adds protobuf support.

### Phase 2: Datadog API Adapter

**New files:** `src/app/api/ingest/datadog/route.ts`, `src/lib/datadog-adapter.ts`

For teams already reporting to Datadog. The adapter polls the Datadog API and converts results into the same `SpanMessage` format.

#### Configuration

User provides credentials via the Connections panel in the app UI:
- **Datadog API Key** + **Application Key** (read-only scoped)
- **Site** (e.g., `datadoghq.com`, `datadoghq.eu`)
- **Query filter** (optional) — e.g., `service:synapse`, `env:production`

Credentials are stored in the Zustand store (persisted to localStorage — acceptable for local use; encrypted server-side storage for deployed version is a future concern).

#### Polling Lifecycle (tied to SSE clients)

The Datadog polling loop is managed by the `IngestBus` subscriber count — not by explicit start/stop requests:

```
POST /api/ingest/datadog/configure
  → stores credentials + query filter in a server-side module-level variable
  → triggers the bus to check if it should start polling

IngestBus subscriber count goes 0 → 1 (browser connects to SSE):
  → if DD credentials are configured, start polling (setInterval, 15s)
  → queries Datadog List Spans API: POST https://api.datadoghq.com/api/v2/spans/events/search
  → filters for spans since last poll
  → converts to SpanMessages, publishes to ingestBus

IngestBus subscriber count goes 1 → 0 (last browser disconnects):
  → stop polling (clearInterval)
  → no orphaned intervals possible
```

This avoids the leaked-interval problem: polling only runs while someone is listening. The SSE relay's `cancel()` callback (fired when the browser disconnects) calls `unsubscribe()`, which decrements the subscriber count automatically.

**Rate limit compliance:** Datadog's List Spans API allows 300 req/hr. At 15-second intervals, that's 240 req/hr — safely under the limit with headroom for retries.

**Datadog span → SpanMessage conversion:**

| Datadog field | SpanMessage field |
|---|---|
| `attributes.service` | `serviceName` |
| `attributes.resource_name` | `spanName` |
| `attributes.duration` (ns) | `durationMs` (/ 1e6) |
| `attributes.status` (`"error"` or `"ok"`) | `statusCode` (2 or 1) |
| `attributes.type` (web/db/cache/custom) | `kind` (mapped to closest OTLP SpanKind) |
| `attributes.timestamp` | `timestamp` |

**Datadog alerts** can also be fetched via `GET /api/v1/events` (filtered by `sources:alert`). Each alert event becomes a SpanMessage with `statusCode=2` and `spanName` set to the monitor name.

**Dependency:** `datadog-api-client` npm package (same library used in Filament's devscripts CLI at `~/Filament/devscripts/cli/cli/datadog.py`, but the JS version).

### Phase 3: SSE Relay

**New file:** `src/app/api/ingest/stream/route.ts`

Follows the existing `/api/wiki-stream` route pattern. Key additions: proper cleanup in `cancel()` and a server-side ring buffer for backpressure.

```typescript
export const runtime = 'nodejs'

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const unsub = ingestBus.subscribe((msg) => {
        controller.enqueue(`data: ${JSON.stringify(msg)}\n\n`)
      })
      // Stash unsubscribe for cancel()
      ;(controller as any).__unsub = unsub
    },
    cancel(controller) {
      // CRITICAL: unsubscribe when client disconnects to prevent listener leaks
      // and to decrement subscriber count (which stops Datadog polling)
      ;(controller as any).__unsub?.()
    }
  })
  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
```

**Backpressure:** For high-throughput OTLP ingestion, the bus can receive hundreds of spans/sec. The SSE relay should drop oldest messages if a per-client ring buffer (100 messages) fills. This prevents unbounded memory growth when the browser can't consume fast enough. The event shaping on the client side (cooldown, burst cap) handles the audio side; this handles the network side.

No authentication for MVP (localhost only). Future: bearer token per user.

### Phase 4: OTLPStreamPlugin (Browser)

**New file:** `src/streams/otlp.ts`

Follows the Wikipedia plugin's EventSource + queue pattern exactly:

```
connect(signal) → opens EventSource to /api/ingest/stream
  → on message: parse SpanMessage JSON
    → convert to DataPoint { streamId: "otlp:<serviceName>", timestamp, fields }
    → push to yield queue
  → on error: EventSource auto-reconnects (built-in)
  → on abort signal: close EventSource, return
```

**DataPoint field mapping:**

| SpanMessage field | DataPoint field | Type | Range | Sonification use |
|---|---|---|---|---|
| `durationMs` | `durationMs` | number | 0-30000 | → `scaleIndex` (log scale, short=low, long=high) |
| `durationMs` | `noteDurationMs` | number | 0-30000 | → `duration` (clamped 50ms-2s) |
| `statusCode` | `isError` | boolean | 0/1 | → `filterCutoff` (error=darker), `detune` (error=detuned) |
| `statusCode` | `statusCode` | number | 0-2 | available for custom mappings |
| `kind` | `spanKind` | number | 0-5 | available for custom mappings |
| `spanName` | `spanName` | string | — | display in error feed |
| `attributes.http.response.status_code` | `httpStatusCode` | number | 100-599 | available for custom mappings |

**Plugin registration:**
- Plugin `id`: `"otlp"`, `name`: `"OpenTelemetry"`, `category`: `"observability"`
- Added to `createPlugins()` unconditionally (always available, connects lazily)
- EventSource handles reconnection automatically (unlike WebSocket)

**Type change:** Add `'observability'` to the `StreamPlugin.category` union in `src/types/stream.ts`.

### Phase 5: Auto-Channel Creation

**The core challenge:** `AudioEngine.handleDataPoint()` silently drops DataPoints for unknown `streamId`s (audio-engine.ts:1060). Channels must exist in the store and be reconciled into audio nodes before sound plays.

**Solution — generic `onUnknownStreamId` callback + `parentPluginId` on ChannelConfig:**

Rather than embedding OTLP-specific prefix checks in the AudioEngine (which is currently a pure reconciler), add a generic callback:

1. **`AudioEngine` gets an optional `onUnknownStreamId?: (streamId: string) => void` callback.** When `handleDataPoint()` encounters an unknown `streamId`, it calls the callback (if set) and returns. The engine stays domain-agnostic.

2. **`useStreamscapes` registers the callback** during setup. The callback checks if the `streamId` starts with `"otlp:"`, and if so, calls `store.addChannel()` with a default OTLP config. This puts the OTLP-specific logic in the orchestration layer, not the engine.

3. **`ChannelConfig` gets an optional `parentPluginId?: string` field.** Auto-created OTLP channels set `parentPluginId: 'otlp'`. The `useStreamscapes` channel-connect effect skips calling `manager.connectStream()` for channels with a `parentPluginId` — they're fed by the parent plugin's single SSE connection, not their own.

This approach:
- Keeps the AudioEngine as a pure reconciler (no OTLP knowledge, no store mutations)
- Keeps the plugin clean (no store dependency)
- Avoids scattered `"otlp:"` prefix checks — the prefix is only checked in one place (the callback)
- `parentPluginId` is a generic concept that supports future multiplexed plugins
- Zustand's `set()` and `subscribeWithSelector` fire synchronously, so `reconcileChannels` runs within the same call stack as `addChannel()` — the channel and nodes exist immediately, and the first DataPoint plays on the next arrival (only the triggering DataPoint is lost, which is inaudible)

**Default OTLP ChannelConfig:**

```typescript
// Field names must match the SonificationMapping interface: sourceField, targetParam, invert
// All required ChannelConfig fields must be present (enabled, pan, mute, solo, effects)
const DEFAULT_OTLP_CHANNEL: ChannelConfig = {
  enabled: true,
  mode: 'triggered',
  synthType: 'Synth',
  synthOptions: { oscillator: { type: 'triangle' } },
  volume: -12,
  pan: 0,
  mute: false,
  solo: false,
  effects: [],
  parentPluginId: 'otlp',           // marks this as a sub-channel of the OTLP plugin
  mappings: [
    { sourceField: 'durationMs', targetParam: 'scaleIndex', curve: 'log', inputRange: [1, 10000], outputRange: [0, 14], invert: false },
    { sourceField: 'durationMs', targetParam: 'duration', curve: 'log', inputRange: [1, 10000], outputRange: [0.05, 0.8], invert: false },
    { sourceField: 'isError', targetParam: 'filterCutoff', curve: 'step', inputRange: [0, 1], outputRange: [8000, 800], invert: false },
    { sourceField: 'isError', targetParam: 'detune', curve: 'step', inputRange: [0, 1], outputRange: [0, 50], invert: false },
  ],
  eventCooldownMs: 50,
  eventBurstCap: 8,
}
```

**Channel naming:** `streamId = "otlp:<service.name>"` (e.g., `"otlp:synapse"`, `"otlp:daimon-agent"`)

**Channel cap:** Maximum 12 OTLP channels. Beyond this, new services are ignored until an existing channel is removed.

**Dynamic colors:** Cycle through a hardcoded 12-color palette by insertion order (`OTLP_COLORS[index % 12]`). Simpler than hashing and deterministic per session.

**Stream constants:** Add `getStreamColor(id)` / `getStreamLabel(id)` functions to `src/lib/stream-constants.ts` that handle both static IDs and dynamic `"otlp:*"` IDs. For `"otlp:synapse"`, label returns `"synapse"` (strip prefix), color returns from the OTLP palette.

**Stale channel cleanup:** On app startup, mark all persisted `"otlp:*"` channels as `enabled: false`. They re-enable when fresh data arrives (the `onUnknownStreamId` callback sets `enabled: true` if the channel already exists). This prevents silent Tone.js node allocation for services that no longer send data.

### Phase 6: Error Feed

**New file:** `src/components/ErrorFeed.tsx`

A scrollable toast-style panel showing all recent error spans.

**Behavior:**
- Anchored to the bottom-right of the viewport, overlays on both Listen and Controls tabs
- Shows all recent errors (in-memory ring buffer, last 50, session-only)
- Newest on top, scroll to see older entries
- Each entry: compact single-line toast showing timestamp, service name, span name, error message (if available)
- Color-coded by service (same accent color as the mixer channel)
- **"Dismiss all" button** pinned at the top of the list, always visible when 2+ errors exist
- Individual dismiss per entry (X button or swipe)
- Collapsed by default — shows a badge count on a small floating indicator; click to expand
- Dismissed errors are removed from the list (not just hidden)

**Data flow:**
- `AudioEngine.handleDataPoint()` checks `isError` field — if true, also pushes to an error feed store (separate Zustand slice or simple React context)
- ErrorFeed component subscribes to this store and renders the list
- No persistence — errors are cleared on page reload

**Entry format:**
```
  12:34:05  synapse         GET /sync                  500
  12:34:02  daimon-agent    process_message            timeout
  12:33:58  synapse         send_push_notification     connection refused
  ─────────────────────────────────────────────────────────
  Dismiss all (3)
```

### Phase 7: Connections Panel

**New file:** `src/components/ConnectionsPanel.tsx`

A section within the Controls tab for configuring OTLP and Datadog ingestion.

**Layout:**
- **OTLP section:**
  - Shows ingest URL: `http://localhost:3000/api/ingest/otlp`
  - Copy button for the URL
  - Snippet for OTel Collector config (copyable):
    ```yaml
    exporters:
      otlphttp/streamscapes:
        endpoint: http://localhost:3000/api/ingest/otlp
        encoding: json
    ```
  - Snippet for SDK env var: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000/api/ingest/otlp`
  - Live status: "Receiving from 3 services" or "Waiting for data..."
  - "Send test span" button (fires a sample span for verification)

- **Datadog section:**
  - API Key + Application Key input fields (masked)
  - Site dropdown (datadoghq.com, datadoghq.eu, etc.)
  - Optional query filter input
  - Save button (POSTs credentials to `/api/ingest/datadog/configure`; polling starts automatically when SSE client is connected)
  - Clear credentials button (stops polling, removes stored keys)
  - Live status: "Polling every 15s — 47 spans last minute" or "Not configured"

### Phase 8: Wiring and Existing UI Updates

**`useStreamscapes.ts` changes:**
- The OTLP plugin is always registered, connects when `isPlaying` is true
- EventSource handles reconnection automatically (no manual reconnect logic needed)
- Registers `onUnknownStreamId` callback on AudioEngine that creates default OTLP channels
- Channel-connect effect skips `connectStream()` for channels where `parentPluginId` is set
- On startup, disables persisted `"otlp:*"` channels (re-enabled when data arrives)

**Mixer changes (minimal):**
- Dynamic OTLP channels appear automatically (already iterates `Object.keys(channels)`)
- Color/label fallbacks via new `getStreamColor()` / `getStreamLabel()` functions

**TransportBar changes:**
- Status dots for OTLP channels appear dynamically
- Single "OTLP" meta-dot showing ingest connection state

**StreamBrowser:** No changes for MVP.

**Persistence:**
- OTLP channels persist in localStorage
- Datadog credentials persist in localStorage (acceptable for local-only MVP)
- On reload without data flowing, channels show as disconnected
- `resetAudioConfig()` wipes OTLP channels; they reappear as new spans arrive

## Testing with Filament Services

The Filament repos at `~/Filament/` provide real Datadog-integrated services for testing:

### OTLP Direct Path
- **Daimon Agent** (`~/Filament/daimon`) — already exports OTLP gRPC to `localhost:4317`. Add a second HTTP/JSON exporter to `localhost:3000/api/ingest/otlp` in its OTel config, or redirect via a local OTel Collector.
- **RAG Ingester** (`~/Filament/rag-ingester`) — OTLP-ready via `filament-otel` library. Same approach.
- **Matrix Auth Service** (`~/Filament/matrix-authentication-service`) — has OTLP exporter config in `crates/config/src/sections/telemetry.rs`.

### Datadog API Path
- **Synapse** (`~/Filament/synapse`) — richest instrumentation: ddtrace APM with SQLAlchemy, Redis, HTTP, Anthropic spans + 150+ OpenMetrics metrics. Already reporting to Datadog.
- **Credentials** — available via `FILAMENT_CLI_DD_API_KEY` + `FILAMENT_CLI_DD_APPLICATION_KEY` (stored in AWS Secrets Manager, also accessible via devscripts CLI at `~/Filament/devscripts/cli/cli/datadog.py`).
- **devscripts CLI** — has working `search-spans`, `get-trace`, `list-services` commands as reference implementation for querying the Datadog API.

### Test Plan
1. Start Streamscapes (`npm run dev`)
2. Open browser, click "PLUG IN"
3. **OTLP test:** Run Daimon Agent locally with OTLP HTTP/JSON exporter pointed at `localhost:3000/api/ingest/otlp`. Verify channels auto-create, spans produce notes.
4. **Datadog test:** Enter DD API credentials in Connections panel, connect. Verify Synapse spans from production appear as channels and produce notes.
5. **Error test:** Trigger an error span (e.g., a failed Synapse request). Verify darker/detuned note + error appears in the feed.
6. **Dismiss test:** Accumulate several errors, verify scroll works, verify "dismiss all" clears them.

## Acceptance Criteria

### Functional Requirements

- [ ] `POST /api/ingest/otlp/v1/traces` accepts OTLP/HTTP JSON, returns `200 {}`
- [ ] `GET /api/ingest/stream` serves SSE with SpanMessage events
- [ ] Datadog adapter polls DD API for recent spans/alerts when connected
- [ ] OTLPStreamPlugin connects to SSE relay and converts events to DataPoints
- [ ] DataPoints include fields: `durationMs`, `noteDurationMs`, `isError`, `statusCode`, `spanKind`, `spanName`, `httpStatusCode`
- [ ] Plugin uses `streamId = "otlp:<service.name>"` for each DataPoint
- [ ] Unknown `"otlp:*"` streamIds auto-create channels with default triggered-mode config
- [ ] Maximum 12 OTLP channels; additional services are ignored
- [ ] Auto-created channels have dynamically assigned accent colors
- [ ] Span completions produce audible triggered notes (pitch scaled by span duration, log curve)
- [ ] Error spans (status.code=2) sound audibly different (darker, slightly detuned)
- [ ] OTLP channels appear in the Mixer with service name labels, and support solo/mute/volume
- [ ] `StreamPlugin.category` union includes `'observability'`
- [ ] Error feed shows all recent error spans in a scrollable toast-style list
- [ ] Error feed has "dismiss all" button and per-entry dismiss
- [ ] Error feed is session-only (cleared on page reload), max 50 entries
- [ ] Connections panel shows OTLP ingest URL with copy button and config snippets
- [ ] Connections panel has Datadog API key inputs and connect/disconnect toggle
- [ ] "Send test span" button works for verifying OTLP setup

### Non-Functional Requirements

- [ ] No CLI process required — everything runs within the Next.js server
- [ ] End-to-end latency from span arrival to audio output is under 200ms
- [ ] The OTLPStreamPlugin does not break the app when no data is flowing (silent, no errors)
- [ ] Error feed does not impact audio performance (lightweight rendering, ring buffer bounded)

### Testing

- [ ] Unit tests for OTLP JSON parsing (`src/lib/otlp-parse.ts`) — valid payloads, missing fields, edge cases
- [ ] Unit tests for Datadog span → SpanMessage conversion
- [ ] Unit tests for span-to-DataPoint field mapping
- [ ] Unit tests for auto-channel creation logic in `handleDataPoint()`
- [ ] Integration test: send OTLP JSON to `/api/ingest/otlp/v1/traces`, verify SSE receives SpanMessage
- [ ] Manual test with Daimon Agent (OTLP) and Synapse via Datadog API

## Dependencies & Risks

**New dependencies:**
- `datadog-api-client` — Datadog API client for the adapter (JS version of what devscripts uses)
- No other new deps; SSE uses the same pattern as the existing wiki-stream route

**Risks:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| JSON-only OTLP is friction (SDKs default to protobuf) | High | Clear docs + env var in Connections panel snippets. Phase 2 adds protobuf. |
| High span volume overwhelms audio engine | Medium | Event shaping defaults (cooldown 50ms, burst cap 8) throttle per-channel. Channel cap at 12. |
| Datadog API rate limits | Medium | Poll every 15s (240 req/hr, under 300 req/hr limit). Adaptive backoff on 429 responses. |
| 1:N plugin-to-stream breaks StreamManager assumptions | Medium | `parentPluginId` on ChannelConfig lets orchestration skip `connectStream()` for sub-channels. StreamManager only tracks the parent `"otlp"` connection. |
| In-memory event bus lost on server restart | Low | Acceptable — live sonification, not a monitoring backend. |
| Datadog API credentials in localStorage | Low | Acceptable for local-only MVP. Document the risk. Encrypted storage for deployed version. |

## Future Considerations (Out of Scope for MVP)

- **Protobuf support** — accept `application/x-protobuf` for zero-config SDKs
- **Metrics signal** — `POST /v1/metrics` → continuous mode (pitch/filter from gauge values)
- **Logs signal** — `POST /v1/logs` → pattern mode (density from log rate, pitch from severity)
- **Cloud relay / user accounts** — hosted endpoint for remote/team use
- **Presets** — "Heartbeat", "Service Map", "Incident Mode" curated configs
- **Custom mappings UI** — configure which span fields map to which audio parameters
- **Service topology visualizer** — show spans in the visualizer by service
- **Datadog webhooks** — instead of polling, receive real-time webhooks (requires public URL)
- **PagerDuty / Opsgenie / generic webhook adapters** — same ingest bus, different parsers
- **Error feed persistence** — optional localStorage or IndexedDB for error history
- **Mobile/iOS** — possible via cloud relay

## Implementation Order

```
 1. src/lib/ingest-bus.ts                          — In-memory pub/sub singleton (globalThis stash, subscriber count tracking)
 2. src/lib/otlp-parse.ts                          — OTLP JSON parsing (pure functions, testable)
 3. src/app/api/ingest/otlp/v1/traces/route.ts     — OTLP POST endpoint (runtime='nodejs')
 4. src/app/api/ingest/stream/route.ts              — SSE relay with cancel() cleanup + backpressure (runtime='nodejs')
 5. src/types/stream.ts                             — Add 'observability' category
 6. src/types/sonification.ts                       — Add optional parentPluginId to ChannelConfig
 7. src/streams/otlp.ts                             — OTLPStreamPlugin (EventSource + queue)
 8. src/streams/defaults.ts                         — DEFAULT_OTLP_CHANNEL config (correct field names)
 9. src/lib/audio-engine.ts                         — Add onUnknownStreamId callback to handleDataPoint()
10. src/lib/stream-constants.ts                     — getStreamColor()/getStreamLabel() + OTLP color palette
11. src/streams/index.ts                            — Register OTLPStreamPlugin
12. src/hooks/useStreamscapes.ts                    — Register callback, skip connectStream for parentPluginId channels, stale channel cleanup
13. src/lib/datadog-adapter.ts                      — DD API polling (lifecycle tied to bus subscriber count)
14. src/app/api/ingest/datadog/route.ts             — DD credential config route (POST, runtime='nodejs')
15. src/components/ErrorFeed.tsx                     — Scrollable error toast feed
16. src/components/ConnectionsPanel.tsx              — OTLP URL + DD credentials config UI
17. Tests                                           — Unit + integration tests
```

## References & Research

### Internal References
- Stream plugin interface: `src/types/stream.ts:1-13`
- Wikipedia plugin (SSE + queue pattern template): `src/streams/wikipedia.ts:9-67`
- Wiki-stream API route (SSE server pattern): `src/app/api/wiki-stream/route.ts`
- StreamManager orchestrator: `src/lib/stream-manager.ts`
- AudioEngine handleDataPoint: `src/lib/audio-engine.ts:1051`
- handleTriggered mode: `src/lib/audio-engine.ts:1082-1128`
- Store addChannel: `src/store/index.ts:201-206`
- Default channel configs: `src/streams/defaults.ts`
- Stream constants: `src/lib/stream-constants.ts`
- Plugin registration: `src/streams/index.ts:8-16`
- useStreamscapes hook: `src/hooks/useStreamscapes.ts`

### Filament References
- Datadog API CLI (reference implementation): `~/Filament/devscripts/cli/cli/datadog.py`
- Datadog credentials: `~/Filament/devscripts/cli/cli/utils/secret_defs.py`
- Daimon OTLP config: `~/Filament/daimon/agent/src/opentelemetry.rs`
- Synapse ddtrace setup: `~/Filament/synapse/synapse/ddtrace_patch.py`
- Synapse OpenMetrics config: `~/Filament/devscripts/terraform/modules/ec2-config-s3/datadog-openmetrics-config.yaml.tpl`

### External References
- OTLP/HTTP spec: https://opentelemetry.io/docs/specs/otlp/
- OTel semantic conventions: https://opentelemetry.io/docs/specs/semconv/
- Datadog List Spans API: https://docs.datadoghq.com/api/latest/spans/
- Datadog Events API: https://docs.datadoghq.com/api/latest/events/
- datadog-api-client (JS): https://github.com/DataDog/datadog-api-client-typescript
