import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * Internet Archive changes stream.
 * Uses the IA Changes API (changes.php) to get real-time item changes,
 * then hydrates the batch with metadata via one Advanced Search query.
 *
 * The pagination token and the current hydrated batch live in Redis so all
 * serverless instances (and all listeners) share one cursor and hear the
 * same batch — module state alone diverges per-instance and per-user on
 * Vercel. Falls back to module state on localhost without Redis.
 */

const IAS3_ACCESS = process.env.IAS3_ACCESS_KEY;
const IAS3_SECRET = process.env.IAS3_SECRET_KEY;

const TOKEN_KEY = 'archive:next-token';
const BATCH_KEY = 'archive:batch';
// Shorter than the client poll interval (15s) so a re-polling client gets a
// fresh batch instead of replaying the one it just played.
const BATCH_TTL_S = 10;

interface ArchiveItem {
  identifier: string;
  mediatype: string;
  title?: string;
  collection?: string;
  publicdate?: string;
  downloads?: number;
}

interface BatchResponse {
  items: ArchiveItem[];
  totalChanges: number;
  doSleep: boolean;
}

// In-memory fallback when Redis is not configured or unavailable (e.g.
// rate-limited) — the stream degrades to per-instance state instead of dying.
let memToken: string | undefined;

async function redisGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch (err) {
    console.warn('[archive] redis get failed:', err);
    return null;
  }
}

async function redisSet(key: string, value: unknown, opts?: { ex: number }): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, opts);
  } catch (err) {
    console.warn('[archive] redis set failed:', err);
  }
}

export async function GET() {
  if (!IAS3_ACCESS || !IAS3_SECRET) {
    return NextResponse.json({ error: 'IAS3 credentials not configured' }, { status: 500 });
  }

  try {
    // Serve the shared batch if another listener already polled this interval
    const cached = await redisGet<BatchResponse>(BATCH_KEY);
    if (cached) return NextResponse.json(cached);

    const params = new URLSearchParams();
    params.set('access', IAS3_ACCESS);
    params.set('secret', IAS3_SECRET);

    // Prefer the shared Redis cursor, fall back to this instance's own.
    // With no cursor at all, omit start params entirely — the Changes API
    // then starts at the head of the feed (~35 changes/min), which avoids
    // replaying the same historical batch on every cold start.
    const storedToken = (await redisGet<string>(TOKEN_KEY)) ?? memToken;
    if (storedToken) {
      params.set('token', storedToken);
    }

    const res = await fetch('https://archive.org/services/changes.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `IA API error: ${res.status}`, detail: text }, { status: res.status });
    }

    const data = await res.json();

    // Check for API-level errors
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    if (data.next_token) {
      memToken = data.next_token;
      await redisSet(TOKEN_KEY, data.next_token);
    }

    const identifiers: string[] = (data.changes ?? [])
      .slice(0, 20)
      .map((c: { identifier: string }) => c.identifier);

    const items = await hydrate(identifiers);

    const batch: BatchResponse = {
      items,
      totalChanges: data.changes?.length ?? 0,
      doSleep: data.do_sleep_before_returning ?? false,
    };

    await redisSet(BATCH_KEY, batch, { ex: BATCH_TTL_S });

    return NextResponse.json(batch);
  } catch (err) {
    console.error('[archive] route error:', err);
    return NextResponse.json({ error: 'Failed to fetch archive changes' }, { status: 500 });
  }
}

/**
 * Hydrate a batch of identifiers with one Advanced Search query instead of
 * N per-item Metadata API calls. Items absent from the public search index
 * (access-restricted captures, not-yet-indexed uploads) are dropped so every
 * event carries real metadata — unless the search query itself failed, in
 * which case unhydrated items pass through so the stream keeps flowing.
 */
async function hydrate(identifiers: string[]): Promise<ArchiveItem[]> {
  if (identifiers.length === 0) return [];

  const query = `identifier:(${identifiers.map((id) => `"${id}"`).join(' OR ')})`;
  const url =
    'https://archive.org/advancedsearch.php' +
    `?q=${encodeURIComponent(query)}` +
    '&fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=collection&fl[]=publicdate&fl[]=downloads&fl[]=oai_updatedate' +
    `&rows=${identifiers.length}&page=1&output=json`;

  let docs: Array<{
    identifier: string;
    title?: string | string[];
    mediatype?: string;
    collection?: string | string[];
    publicdate?: string;
    downloads?: number;
    oai_updatedate?: string[];
  }> = [];
  let searchOk = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      docs = json.response?.docs ?? [];
      searchOk = true;
    }
  } catch {
    // fall through to unhydrated items
  }

  if (!searchOk) {
    return identifiers.map((id) => ({ identifier: id, mediatype: 'unknown' }));
  }

  const byId = new Map(docs.map((d) => [d.identifier, d]));

  // A change event for an item whose last real edit (max oai_updatedate,
  // which tracks the _meta.xml mtime) is old is internal catalog churn
  // (re-index, derive sweep) — no publicly visible change, so no sound.
  const RECENT_MS = 3 * 86_400_000;
  const now = Date.now();

  return identifiers.flatMap((id) => {
    const doc = byId.get(id);
    if (!doc) return [];
    const stamps = [...(doc.oai_updatedate ?? []), doc.publicdate]
      .map((s) => (s ? Date.parse(s) : NaN))
      .filter(Number.isFinite);
    const lastEdit = stamps.length ? Math.max(...stamps) : NaN;
    if (!Number.isFinite(lastEdit) || now - lastEdit > RECENT_MS) return [];
    return [{
      identifier: id,
      mediatype: doc.mediatype ?? 'unknown',
      title: (Array.isArray(doc.title) ? doc.title[0] : doc.title) ?? id,
      collection: Array.isArray(doc.collection) ? doc.collection[0] : doc.collection ?? '',
      publicdate: doc.publicdate,
      downloads: doc.downloads,
    }];
  });
}
