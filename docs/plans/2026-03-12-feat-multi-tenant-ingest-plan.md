---
title: "feat: Multi-Tenant Ingest — Per-User Data Isolation"
type: feat
date: 2026-03-12
---

# Multi-Tenant Ingest — Per-User Data Isolation

## Overview

Partition the ingest pipeline so each user hears only their own sources. Today every SSE client receives every span from every source — IngestBus is a single `Set<Listener>`, Datadog adapter holds one global config, and webhook routes have no user association. This plan threads `userId` through ~6 files to add per-user routing.

Public streams (weather, flights, wikipedia, stocks, RSS) are unaffected — they're client-side plugins that never touch IngestBus.

## Problem Statement

- If User A configures Datadog, User B hears User A's spans
- User B configuring Datadog silently overwrites User A's config (single `globalThis.__ddConfig`)
- Webhook routes use a single env-var secret — no per-user routing
- OTLP ingest is unauthenticated — anyone can POST spans and everyone hears them

## Design Decisions

### What changes

| Component | Current | After |
|-----------|---------|-------|
| IngestBus | `Set<Listener>` singleton | `Map<userId, Set<Listener>>` |
| SSE relay | Unauthenticated, broadcasts all | Auth via session cookie, subscribe to user's channel only. 401 for anon. |
| Datadog adapter | Single config on `globalThis` | `Map<userId, AdapterState>` — per-user poll loops, seen-IDs, recent spans |
| OTLP route | Unauthenticated | API-key lookup → userId tag on each message |
| GitHub webhook | Single env-var secret | Per-user URL path (`/api/ingest/webhooks/github/<configId>`) → direct secret lookup |
| Notify route | Unauthenticated | Bearer API key → userId tag |

### What stays the same

- **Public streams** (weather, flights, wikipedia, stocks, RSS) — client-side plugins, not bus-routed
- **DB schema** — `source_config` already has `userId` FK. Add `api_key_hash` column to `user` table via `drizzle-kit push` (no migration needed, no users yet).
- **Auth system** — NextAuth + session callback already exposes `user.id`
- **Client-side mixer** — localStorage persistence unchanged
- **Audio engine** — no changes

### Anonymous users

Public streams work as-is (client-side plugins). Anonymous users don't connect to the SSE relay at all — the ingest `StreamPlugin` skips the EventSource connection when not authenticated. SSE relay returns 401 for unauthenticated requests.

### SSE auth via cookies

`EventSource` can't send custom headers, but same-origin requests automatically send the NextAuth session cookie. The SSE relay calls `auth()` once at connection time to get userId. Session expiry during a long-lived connection is fine — it reconnects and re-authenticates.

### Per-user API key

Single `api_key_hash` column on the `user` table. One key per user, generated as `crypto.randomBytes(32).toString('base64url')`, hashed with SHA-256 before storage, displayed once on creation. A `key_prefix` column (first 8 chars) lets users identify their key in the UI. One "Regenerate" button, no multi-key CRUD.

Lookup: hash the incoming `Authorization: Bearer <key>`, query `user` table by hash. Index on `api_key_hash` column.

### Datadog adapter refactor

Mechanical change — replace scalar `globalThis` state with `Map<string, ...>` keyed by userId:

- `g.__ddConfig` → `g.__ddConfigs.get(userId)`
- `g.__ddInterval` → `g.__ddIntervals.get(userId)`
- `g.__ddSeenIds` → `g.__ddSeenIds.get(userId)`

All existing functions get a `userId` parameter. `checkPollingLifecycle(userId)` starts/stops that user's poll when their SSE subscriber count changes. `convertSpan` and `ddTypeToKind` are already pure — no changes needed.

Idle timeout of 5 minutes as safety net for leaked connections.

### GitHub webhook routing

Per-user webhook URLs: `/api/ingest/webhooks/github/<configId>`. The route looks up the specific `source_config` by ID, verifies HMAC against that config's secret, and publishes to the config owner's bus channel. O(1) lookup — no scanning all users' secrets.

## Acceptance Criteria

- [ ] Each user's SSE stream only contains their own ingest data
- [ ] Multiple users can configure Datadog simultaneously without overwriting each other
- [ ] Per-user Datadog polling starts/stops based on that user's SSE connections
- [ ] OTLP POST requires a valid API key, spans route to the key owner's bus channel
- [ ] GitHub webhook route uses per-config URL, routes to the config owner's bus channel
- [ ] Notify route requires a Bearer API key, routes to the key owner's bus channel
- [ ] Anonymous users see public streams (client-side), no SSE connection
- [ ] Per-user API key with regenerate UI in ConnectionsPanel
- [ ] No regression on public streams (weather, flights, wikipedia, stocks, RSS)

## What's Deferred

| Deferred | Reason |
|----------|--------|
| Shareable source configs (unlisted links) | Zero users have asked. Add in an afternoon when needed. |
| Multi-key API key management | One key per user covers every use case at this scale. |
| Rate limiting per user | Add when abuse is observed |
| Per-user resource quotas | Simple hard limits first |
| Public gallery of source configs | No community yet |
| Real-time collaboration | Sharing is a future feature |
| iOS multi-user | Needs native auth flow first |
| Admin dashboard | Not needed at 10-100 users |

## Deployment Constraint

This plan assumes a **single long-lived Node process** (VPS, Railway, Fly.io). All per-user state lives in process memory via `globalThis` Maps. If deploying to Vercel serverless (multiple isolates, no shared memory), the IngestBus and adapter state would need to move to Redis or similar — that's a fundamentally different scope and should be a separate plan.

## Implementation Order

1. **Schema** — Add `api_key_hash` + `key_prefix` columns to `user` table. `drizzle-kit push`.
2. **Partitioned IngestBus + authenticated SSE relay** — `Map<string, Set<Listener>>` keyed by userId. SSE relay reads session cookie, subscribes to user's channel, returns 401 for anon. Client-side ingest plugin skips EventSource when not authenticated.
3. **Datadog adapter per-user** — Replace scalar `globalThis` state with userId-keyed Maps. Wire lifecycle to per-user subscriber count from IngestBus.
4. **API key auth on ingest routes** — OTLP, notify, GitHub webhook all look up API key → userId. GitHub webhooks use per-config URL paths for O(1) secret lookup.
5. **ConnectionsPanel** — Display API key (once on creation), regenerate button, per-user webhook URLs, per-user Datadog status.

## References

### Internal
- `src/lib/ingest-bus.ts` — Current singleton IngestBus
- `src/lib/datadog-adapter.ts` — globalThis config pattern, polling lifecycle
- `src/app/api/ingest/stream/route.ts` — SSE relay
- `src/app/api/ingest/otlp/v1/traces/route.ts` — OTLP POST route
- `src/app/api/ingest/webhooks/github/route.ts` — GitHub webhook route
- `src/app/api/ingest/notify/route.ts` — Notify route
- `src/app/api/user/configs/route.ts` — Already multi-tenant configs API
- `src/db/schema.ts` — Current schema (source_config already user-scoped)
- `src/lib/auth.ts` — NextAuth config with session.user.id callback
