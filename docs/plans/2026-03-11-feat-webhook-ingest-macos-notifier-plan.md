---
title: "feat: Webhook Ingest — GitHub + Notify Route"
type: feat
date: 2026-03-11
---

# Webhook Ingest — GitHub + Notify Route

## Overview

Expand Streamscapes' input sources with two lightweight additions:

1. **GitHub Webhook Route** — `POST /api/ingest/webhooks/github` that verifies HMAC, normalizes the payload into a `SpanMessage`, and publishes to the existing IngestBus → SSE → AudioEngine pipeline. Additional services (Slack, PagerDuty, Linear) added incrementally in follow-up PRs.

2. **Notify Route** — `POST /api/ingest/notify` — a simple unauthenticated local endpoint that anything (shell scripts, macOS Shortcuts, a future menu bar helper) can POST to for instant sonification.

The macOS System Notification Helper (menu bar app with AXObserver) is **deferred to a separate plan** — it's a standalone native macOS app with its own distribution, signing, and compatibility concerns.

## Problem Statement / Motivation

Streamscapes currently sonifies environmental streams and observability data (OTLP/Datadog). Missing: **notification events** from tools people use daily — GitHub PRs, CI deploys, incidents, messages. These are high-signal discrete events that map naturally to triggered notes.

Webhooks are the standard mechanism. Start with GitHub (simplest HMAC, most common), prove the pattern, add services later.

## Technical Approach

### 1. Extract `IngestSource` type (not `string`)

**File:** `src/lib/ingest-bus.ts`

Per reviewer feedback, keep compile-time exhaustiveness checks instead of widening to `string`:

```typescript
export type IngestSource = 'otlp' | 'datadog' | 'github' | 'notify';

export interface SpanMessage {
  // ...
  readonly source?: IngestSource;
}
```

Adding a new source is a one-line union addition. TypeScript catches typos and missed switch branches.

### 2. Rename `otlpPlugin` → `ingestPlugin`, use exhaustive prefix map

**File:** `src/streams/otlp.ts` → rename to `src/streams/ingest.ts`

Replace the growing if/else chain with a `Record` that is exhaustive by construction:

```typescript
import type { IngestSource } from '@/lib/ingest-bus';

const SOURCE_PREFIX: Record<IngestSource, string> = {
  otlp: 'otlp',
  datadog: 'dd',
  github: 'github',
  notify: 'notify',
};

// In the message handler:
const prefix = SOURCE_PREFIX[msg.source ?? 'otlp'];
const streamId = `${prefix}:${msg.serviceName}`;
```

Adding a new `IngestSource` without adding it to `SOURCE_PREFIX` is a compile error. No `Set`, no if/else chain.

### 3. Extend `onUnknownStreamId` for any prefixed stream

**File:** `src/hooks/useStreamscapes.ts`

Instead of checking each prefix individually, accept any stream ID with a colon:

```typescript
engine.onUnknownStreamId = (streamId: string) => {
  const colonIdx = streamId.indexOf(':');
  if (colonIdx < 1) return; // no prefix — ignore

  const existingCh = store.getState().channels[streamId];
  if (existingCh) return;

  // Check sub-channel cap
  const subCount = Object.values(store.getState().channels)
    .filter((ch) => ch.parentPluginId).length;
  if (subCount >= MAX_SUB_CHANNELS) return;

  const serviceName = streamId.slice(colonIdx + 1);
  const cfg = createOtlpChannelConfig(serviceName);
  store.getState().addChannel({ ...cfg, streamId });
};
```

Reuse `createOtlpChannelConfig` for all dynamic channels. When we hear real webhook events and they need different defaults, split the factory then.

### 4. GitHub webhook route (inline verify + normalize)

**File:** `src/app/api/ingest/webhooks/github/route.ts`

Single file with inline HMAC verification and normalization (~50 lines). No separate `webhook-verify.ts` or `webhook-normalize.ts` — extract when a second service is added.

```typescript
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import type { SpanMessage } from '@/lib/ingest-bus';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // 1. Read raw body (must not call request.json() — need bytes for HMAC)
  const rawBody = await request.text();

  // 2. Verify GitHub HMAC-SHA256
  const secret = process.env.WEBHOOK_SECRET_GITHUB;
  if (!secret) return new Response('Not configured', { status: 503 });

  const sig = request.headers.get('x-hub-signature-256');
  if (!sig) return new Response('Missing signature', { status: 401 });

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 3. Handle ping events (sent on webhook registration)
  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });

  // 4. Dedup via X-GitHub-Delivery UUID
  const delivery = request.headers.get('x-github-delivery');
  const g = globalThis as unknown as { __ghDeliveries?: Set<string> };
  g.__ghDeliveries ??= new Set();
  if (delivery && g.__ghDeliveries.has(delivery)) {
    return NextResponse.json({ ok: true });
  }
  if (delivery) {
    g.__ghDeliveries.add(delivery);
    if (g.__ghDeliveries.size > 1000) {
      const arr = [...g.__ghDeliveries];
      g.__ghDeliveries = new Set(arr.slice(-500));
    }
  }

  // 5. Normalize to SpanMessage
  const payload = JSON.parse(rawBody);
  const action = payload.action ? `.${payload.action}` : '';
  const spanName = `${event}${action}`;

  const msg: SpanMessage = {
    serviceName: 'github',
    spanName,
    durationMs: event === 'push' ? (payload.commits?.length ?? 1) * 100 : 0,
    statusCode: event === 'security_advisory' ? 2 : 1,
    kind: 1,
    timestamp: Date.now(),
    source: 'github',
  };

  ingestBus.publish(msg);
  return NextResponse.json({ ok: true });
}
```

**Env var:** `WEBHOOK_SECRET_GITHUB` — the webhook secret from GitHub repo settings.

### 5. Notify route (15 lines)

**File:** `src/app/api/ingest/notify/route.ts`

Unauthenticated local endpoint — anything can POST `{ app, text }`:

```typescript
import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import type { SpanMessage } from '@/lib/ingest-bus';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json();
  if (typeof body !== 'object' || body === null) {
    return new Response('Expected JSON object', { status: 400 });
  }
  const msg: SpanMessage = {
    serviceName: typeof body.app === 'string' ? body.app : 'unknown',
    spanName: typeof body.text === 'string' ? body.text : '',
    durationMs: 0,
    statusCode: 1,
    kind: 1,
    timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
    source: 'notify',
  };
  ingestBus.publish(msg);
  return NextResponse.json({ ok: true });
}
```

Test immediately with curl:
```bash
curl -X POST http://localhost:3000/api/ingest/notify \
  -H 'Content-Type: application/json' \
  -d '{"app":"Calendar","text":"Meeting in 15 minutes"}'
```

### 6. Add `github:` color to stream-constants

**File:** `src/lib/stream-constants.ts`

Add one static color entry for GitHub. Other services get colors when they're implemented:

```typescript
'github': '#6e7681',  // GitHub muted gray
```

The existing fallback `#888` handles `notify:` and any future prefixes until we add explicit colors.

### 7. Bump store version

Force reseed of default channels to pick up any changes.

## Acceptance Criteria

- [x] `POST /api/ingest/webhooks/github` verifies HMAC, normalizes, publishes to bus
- [x] GitHub `ping` events return 200 without publishing
- [x] Duplicate deliveries are deduplicated via `X-GitHub-Delivery`
- [x] Invalid/missing HMAC returns 401
- [x] Missing `WEBHOOK_SECRET_GITHUB` env var returns 503
- [x] `request.text()` used for raw body (not `request.json()`)
- [x] `POST /api/ingest/notify` accepts `{ app, text }` and publishes
- [x] Notify route validates input types (rejects non-objects)
- [x] `IngestSource` union type (not `string`) with `'github'` and `'notify'`
- [x] `SOURCE_PREFIX` record is exhaustive (compile error on missing source)
- [x] `otlpPlugin` renamed to `ingestPlugin` in `src/streams/ingest.ts`
- [x] `onUnknownStreamId` creates channels for any prefixed stream ID
- [x] Reuses `createOtlpChannelConfig` (no separate webhook/notify factories)
- [ ] GitHub webhook events produce audible triggered notes
- [ ] Notify events from curl produce audible triggered notes
- [x] `github:` has a distinct color in stream-constants
- [x] Store version bumped

## What's Deferred

These items are explicitly **not** in scope for this PR:

| Deferred | Reason | When |
|----------|--------|------|
| Slack, PagerDuty, Linear webhooks | Ship GitHub first, prove the pattern | Follow-up PRs, one service at a time |
| `createWebhookChannelConfig` factory | Reuse OTLP defaults, tune after hearing real events | When sonification needs differ |
| macOS Notification Helper (menu bar app) | Separate native app with its own concerns | Separate plan |
| Webhook config UI in ConnectionsPanel | Env vars are sufficient for v1 | When multiple services are active |
| Per-service webhook colors | One color (GitHub) is enough for now | When each service ships |

## Implementation Order

1. Extract `IngestSource` type in `ingest-bus.ts`
2. Rename `otlp.ts` → `ingest.ts`, add `SOURCE_PREFIX` record
3. Update imports across codebase for renamed plugin
4. Extend `onUnknownStreamId` to accept any prefixed stream ID
5. Add `github:` color to `stream-constants.ts`
6. Create `src/app/api/ingest/webhooks/github/route.ts`
7. Create `src/app/api/ingest/notify/route.ts`
8. Bump store version
9. Test with a real GitHub webhook + curl to notify route

## References

### Internal
- `src/lib/ingest-bus.ts` — SpanMessage interface + IngestBus singleton
- `src/lib/datadog-adapter.ts` — Reference adapter (dedup pattern, globalThis stash)
- `src/app/api/ingest/otlp/v1/traces/route.ts` — Existing POST route pattern
- `src/app/api/ingest/stream/route.ts` — SSE relay
- `src/streams/otlp.ts:23` — Current source → prefix routing
- `src/hooks/useStreamscapes.ts:63-65` — onUnknownStreamId callback
- `src/streams/defaults.ts` — createOtlpChannelConfig template

### External
- [GitHub Webhook Signature Verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

### Future Plans (out of scope)
- Slack webhook support — needs URL verification challenge + retry dedup
- PagerDuty V3 webhooks — needs multi-signature verification
- Linear webhooks — needs `webhookTimestamp` replay protection
- macOS System Notification Helper — separate plan, AXObserver + Accessibility API + Developer ID distribution
