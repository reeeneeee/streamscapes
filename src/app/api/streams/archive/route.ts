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
let memInitialized = false;

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

    // Prefer the shared Redis cursor, fall back to this instance's own
    const storedToken = (await redisGet<string>(TOKEN_KEY)) ?? memToken;

    if (storedToken) {
      params.set('token', storedToken);
    } else if (!memInitialized) {
      // First call — start from yesterday to get an initial batch of changes
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
      params.set('start_date', yesterday);
    }
    memInitialized = true;

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
 * N per-item Metadata API calls. Items too new for the search index fall
 * back to mediatype 'unknown' so the stream keeps flowing.
 */
async function hydrate(identifiers: string[]): Promise<ArchiveItem[]> {
  if (identifiers.length === 0) return [];

  const query = `identifier:(${identifiers.map((id) => `"${id}"`).join(' OR ')})`;
  const url =
    'https://archive.org/advancedsearch.php' +
    `?q=${encodeURIComponent(query)}` +
    '&fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=collection&fl[]=publicdate&fl[]=downloads' +
    `&rows=${identifiers.length}&page=1&output=json`;

  let docs: Array<{
    identifier: string;
    title?: string | string[];
    mediatype?: string;
    collection?: string | string[];
    publicdate?: string;
    downloads?: number;
  }> = [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      docs = json.response?.docs ?? [];
    }
  } catch {
    // fall through to unhydrated items
  }

  const byId = new Map(docs.map((d) => [d.identifier, d]));

  return identifiers.map((id) => {
    const doc = byId.get(id);
    if (!doc) return { identifier: id, mediatype: 'unknown' };
    return {
      identifier: id,
      mediatype: doc.mediatype ?? 'unknown',
      title: (Array.isArray(doc.title) ? doc.title[0] : doc.title) ?? id,
      collection: Array.isArray(doc.collection) ? doc.collection[0] : doc.collection ?? '',
      publicdate: doc.publicdate,
      downloads: doc.downloads,
    };
  });
}
