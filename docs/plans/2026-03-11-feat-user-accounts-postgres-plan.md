---
title: "feat: User Accounts — Postgres + NextAuth + Drizzle"
type: feat
date: 2026-03-11
---

# User Accounts — Postgres + NextAuth + Drizzle

## Overview

Add user accounts to Streamscapes with Postgres (Neon), NextAuth.js v5, and Drizzle ORM. Users authenticate via Google OAuth, and their source credentials (Datadog API keys, webhook secrets) persist in the database across server restarts. Sound remains ephemeral — no events or spans are stored. Mixer preferences stay in localStorage.

## Problem Statement

Datadog credentials vanish on server restart (stored in `globalThis`). There's no concept of identity. This limits source config persistence to a single server session.

## Design Decisions

### What the DB stores

- **User accounts** (NextAuth sessions, OAuth tokens)
- **Source configs** (Datadog credentials, webhook secrets — application-level encrypted)

### What the DB does NOT store

- Span events, data points, audio events — sound is ephemeral
- Alert notifications — localStorage only
- Mixer preferences, channel configs, global config — localStorage only (cross-device sync deferred)
- Stream plugin state — runtime only

### Anonymous mode

Unauthenticated users get the full current experience — all public streams work with localStorage persistence. Source config persistence requires login. No auth wall.

### Single runtime

Everything runs in the Next.js process. No second runtime, no second deployment. Drizzle talks to Neon Postgres directly. NextAuth handles sessions via its built-in database adapter.

### Credential encryption

API keys (Datadog, future webhook secrets) are encrypted with AES-256-GCM before storage. A 10-line `src/lib/crypto.ts` module uses `ENCRYPTION_MASTER_KEY` from env vars. Neon's at-rest encryption protects against disk theft; application-level encryption protects against a leaked connection string. This is basic credential hygiene, not a secrets manager.

### Config editor

The existing ConnectionsPanel already has the Datadog config form (API key, app key, site, query). This plan modifies it to save/load via the API when authenticated, falling back to localStorage when not. No new config editor UI needed.

## Technical Approach

### 1. Install dependencies

```bash
npm install next-auth@beta @auth/drizzle-adapter drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

### 2. Database schema

**File:** `src/db/schema.ts`

```typescript
import { pgTable, text, timestamp, serial } from 'drizzle-orm/pg-core';
import { users } from '@auth/drizzle-adapter/schema'; // NextAuth tables

export { users, accounts, sessions, verificationTokens } from '@auth/drizzle-adapter/schema';

// Credential types — discriminated union for type-safe parsing
export type SourceCredentials =
  | { provider: 'datadog'; apiKey: string; appKey: string; site: string; query: string }
  | { provider: 'github'; webhookSecret: string };

// Source configs (encrypted credentials for external services)
export const sourceConfigs = pgTable('source_configs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'datadog' | 'github'
  name: text('name').notNull(),
  encryptedCredentials: text('encrypted_credentials'), // AES-256-GCM ciphertext
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

No `settings`, `enabled`, or `createdAt` columns — add when needed.

Uses `text` ID (UUID) instead of `serial` to match NextAuth's ID pattern and avoid enumerable IDs.

### 3. Auth configuration

**File:** `src/lib/auth.ts`

```typescript
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [Google],
});
```

**File:** `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

**Env vars:**
- `DATABASE_URL` — Neon connection string
- `AUTH_GOOGLE_ID` — Google OAuth client ID
- `AUTH_GOOGLE_SECRET` — Google OAuth client secret
- `AUTH_SECRET` — NextAuth session secret (`npx auth secret`)
- `ENCRYPTION_MASTER_KEY` — 32-byte hex key for AES-256-GCM

### 4. Database client

**File:** `src/db/index.ts`

```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

**File:** `drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

### 5. Credential encryption

**File:** `src/lib/crypto.ts` (~10 lines)

```typescript
import crypto from 'node:crypto';

const KEY = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}
```

### 6. Auth UI

Minimal — no modal needed for Google-only auth.

**Start screen:** Small "Sign in" text link in top-right corner. Clicking triggers Google OAuth redirect.

**When authenticated:** User avatar/initial replaces "Sign in" link. Click shows dropdown with email + "Sign out".

**File:** `src/components/AuthButton.tsx` (new, ~40 lines)

### 7. API route for source configs

**File:** `src/app/api/user/configs/route.ts` (new)

```typescript
// GET  — list authenticated user's source configs (decrypt credentials before returning)
// POST — create/update a source config (encrypt credentials before storing)
// DELETE — remove a source config
// Auth check via auth() from NextAuth — return 401 if not authenticated
// Input validation: manual type guard checking required fields per provider type
//   - datadog: apiKey, appKey, site, query (all strings)
//   - github: webhookSecret (string)
```

Credentials flow: `Browser (plaintext) → API route (encrypt) → DB (ciphertext)`. The browser never sees the encryption layer.

### 8. Wire ConnectionsPanel to API

**File:** `src/components/ConnectionsPanel.tsx` (modify)

When authenticated:
- Save DD config via `POST /api/user/configs` instead of `POST /api/ingest/datadog`
- Load DD config via `GET /api/user/configs` on mount
- Decrypt happens server-side in the API route, not in the browser

When not authenticated:
- Fall back to current localStorage behavior (`ss-dd-config`)

### 9. Wire Datadog adapter to DB

**File:** `src/lib/datadog-adapter.ts` (modify)

On SSE subscriber connect (in the SSE relay route):
1. Check if request has an auth session
2. If authenticated, read user's Datadog config from DB (decrypt server-side)
3. Start polling loop in-process as before (`setInterval`, publish to IngestBus)
4. If not authenticated, fall back to current `globalThis.__ddConfig` behavior

On DB failure: fall back to `globalThis.__ddConfig`. Never block audio startup on a network call.

## Acceptance Criteria

- [x] Google OAuth sign-in/sign-out works end-to-end
- [x] Auth state persists across page refreshes (NextAuth session)
- [x] Anonymous users see all public streams, no auth wall
- [ ] Datadog credentials persist across server restarts (stored in DB, encrypted)
- [x] ConnectionsPanel saves/loads DD config from API when authenticated
- [x] ConnectionsPanel falls back to localStorage when not authenticated
- [x] Credentials encrypted with AES-256-GCM before DB storage
- [x] No span events or audio data stored in DB
- [x] Mixer preferences stay in localStorage (not in DB)
- [x] DB failure falls back gracefully (localStorage / globalThis)

## What's Deferred

| Deferred | Reason |
|----------|--------|
| Cross-device mixer sync | Mixer prefs work fine in localStorage. Add when a real user on a second device needs it. |
| Magic link auth | Google OAuth is sufficient for MVP. |
| Multi-tenant IngestBus | Single-user product today. |
| Published/shareable templates | Social feature with no users. |
| Per-user webhook URLs | Current env-var webhooks are fine. |
| iOS authentication | Separate native auth flow. |
| Account deletion / GDPR | Not blocking for MVP. |
| Key rotation for encryption | Single master key is fine for MVP. Include key version in ciphertext when rotation is needed. |

## Implementation Order

1. Install deps (`next-auth`, `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`)
2. Create `src/db/schema.ts` + `src/db/index.ts` + `drizzle.config.ts`
3. Run `npx drizzle-kit push` to create tables in Neon (use `drizzle-kit generate` + `migrate` for production)
4. Configure NextAuth (`src/lib/auth.ts` + `src/app/api/auth/[...nextauth]/route.ts`)
5. Set env vars (`DATABASE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `ENCRYPTION_MASTER_KEY`)
6. Create `src/lib/crypto.ts` (encrypt/decrypt)
7. Create `src/app/api/user/configs/route.ts` (source config CRUD with validation)
8. Build `AuthButton` component
9. Wire `ConnectionsPanel` to use API when authenticated, localStorage when not
10. Wire `datadog-adapter` to read config from DB on SSE connect
11. Test: sign in → configure Datadog → restart server → verify credentials persist

## References

### Internal
- `src/lib/datadog-adapter.ts` — Datadog polling, globalThis config pattern
- `src/components/ConnectionsPanel.tsx` — DD config UI, localStorage `ss-dd-config`
- `src/app/api/ingest/stream/route.ts` — SSE relay (can check auth session here)
- `src/store/index.ts:92-133` — existing `isGlobalConfig`, `sanitizeChannels` validators

### External
- [NextAuth.js v5 docs](https://authjs.dev)
- [Drizzle ORM docs](https://orm.drizzle.team)
- [Neon Postgres](https://neon.tech/docs)
- [@auth/drizzle-adapter](https://authjs.dev/getting-started/adapters/drizzle)
