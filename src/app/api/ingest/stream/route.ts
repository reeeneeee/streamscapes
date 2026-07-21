import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { ingestBus, streamKey } from '@/lib/ingest-bus';
import { auth } from '@/lib/auth';
import { getMobileUser } from '@/lib/mobile-auth';
import type { SpanMessage } from '@/lib/ingest-bus';

export const runtime = 'nodejs';
export const maxDuration = 60; // Hobby plan max — EventSource auto-reconnects

/** Redis stream poll cadence: fast while events flow, backing off while idle
 *  to conserve the Upstash daily command quota. */
const POLL_MS_MIN = 5_000;
const POLL_MS_MAX = 45_000;
const POLL_BACKOFF = 1.7;

// Poll cadence per user, persisted across the ≤60s SSE reconnect cycle —
// without this the backoff would reset before it ever saved a command.
const g = globalThis as unknown as { __ssePollMs?: Map<string, number> };
g.__ssePollMs ??= new Map();

export async function GET(req: NextRequest) {
  // Cookie auth or mobile JWT
  let userId: string | null = null;
  const session = await auth();
  if (session?.user?.id) {
    userId = session.user.id;
  } else {
    const mobile = await getMobileUser(req);
    userId = mobile?.id ?? null;
  }
  // API key via query param (EventSource can't set headers)
  if (!userId) {
    const apiKey = req.nextUrl.searchParams.get('apiKey');
    if (apiKey) {
      const { lookupApiKey } = await import('@/lib/api-keys');
      userId = await lookupApiKey(apiKey);
    }
  }
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send an SSE comment immediately to flush headers and prevent gateway timeout
      controller.enqueue(encoder.encode(`:ok\n\n`));

      const enqueue = (msg: SpanMessage) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // In-memory listener (same-isolate fast path — works on localhost)
      const unsubLocal = ingestBus.subscribeToUser(userId, enqueue);

      if (redis) {
        // Redis stream polling (cross-isolate — required for Vercel)
        // Entry IDs are ms-timestamp based, so seeding the cursor at "now"
        // skips stale backlog without deleting the stream out from under
        // other connected tabs.
        const key = streamKey(userId);
        let lastId = `${Date.now()}-0`;
        let pollMs = g.__ssePollMs!.get(userId) ?? POLL_MS_MIN;
        // Track messages delivered via local bus to avoid duplicates
        const recentLocal = new Set<string>();

        // Wrap local enqueue to track deduplication
        const origEnqueue = enqueue;
        const localEnqueue = (msg: SpanMessage) => {
          // Events are flowing — snap the Redis poll back to fast cadence
          pollMs = POLL_MS_MIN;
          g.__ssePollMs!.set(userId, pollMs);
          // Fingerprint: serviceName + spanName + timestamp
          const fp = `${msg.serviceName}:${msg.spanName}:${msg.timestamp}`;
          recentLocal.add(fp);
          // Trim to prevent unbounded growth
          if (recentLocal.size > 200) {
            const iter = recentLocal.values();
            for (let i = 0; i < 100; i++) {
              const v = iter.next();
              if (v.done) break;
              recentLocal.delete(v.value);
            }
          }
          origEnqueue(msg);
        };

        // Re-subscribe with dedup-aware enqueue
        unsubLocal(); // unsub the original
        const unsubLocal2 = ingestBus.subscribeToUser(userId, localEnqueue);

        const poll = async () => {
          if (closed) return;
          try {
            const results = await redis!.xread(key, lastId, { count: 50 });
            if (!results || !Array.isArray(results) || results.length === 0) {
              pollMs = Math.min(POLL_MS_MAX, pollMs * POLL_BACKOFF);
              g.__ssePollMs!.set(userId, pollMs);
              return;
            }
            pollMs = POLL_MS_MIN;
            g.__ssePollMs!.set(userId, pollMs);
            // Upstash xread returns: [[streamName, [[entryId, [field, value, ...]], ...]]]
            // OR with auto-deserialization: [{id, fields}, ...] or similar
            // Handle both possible formats
            for (const streamEntry of results) {
              let entries: Array<[string, string[]]> | Array<{ id: string; fields: Record<string, string> }>;
              if (Array.isArray(streamEntry) && streamEntry.length === 2) {
                // Format: [streamName, [[id, [k, v, ...]], ...]]
                entries = streamEntry[1] as Array<[string, string[]]>;
              } else {
                continue;
              }
              for (const entry of entries) {
                let entryId: string;
                let dataStr: string | undefined;

                if (Array.isArray(entry)) {
                  // [id, [field, value, field, value, ...]]
                  entryId = entry[0] as string;
                  const fields = entry[1] as string[];
                  const dataIdx = fields.indexOf('data');
                  dataStr = dataIdx >= 0 ? fields[dataIdx + 1] : undefined;
                } else if (entry && typeof entry === 'object' && 'id' in entry) {
                  // {id, fields: {data: "..."}}
                  entryId = (entry as { id: string }).id;
                  dataStr = (entry as { fields: Record<string, string> }).fields?.data;
                } else {
                  continue;
                }

                if (!entryId) continue;
                lastId = entryId;
                if (!dataStr) continue;
                try {
                  const msg: SpanMessage = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr as unknown as SpanMessage;
                  const fp = `${msg.serviceName}:${msg.spanName}:${msg.timestamp}`;
                  if (recentLocal.has(fp)) {
                    recentLocal.delete(fp);
                    continue;
                  }
                  origEnqueue(msg);
                } catch {
                  // Skip malformed entries
                }
              }
            }
          } catch (err) {
            console.error(`[sse-poll] XREAD error:`, err);
            pollMs = Math.min(POLL_MS_MAX, pollMs * POLL_BACKOFF);
            g.__ssePollMs!.set(userId, pollMs);
          }
        };

        // Variable-cadence poll loop (setTimeout chain, not setInterval).
        // No initial poll: the cursor starts at "now", so there is nothing
        // to read until the first interval elapses.
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        const schedule = () => {
          if (closed) return;
          pollTimer = setTimeout(async () => {
            await poll();
            schedule();
          }, pollMs);
        };
        schedule();

        // Keepalive ping every 30s to prevent gateway/proxy timeouts
        const pingInterval = setInterval(() => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(`:ping\n\n`)); } catch { closed = true; }
        }, 30_000);

        cleanupFn = () => {
          closed = true;
          if (pollTimer) clearTimeout(pollTimer);
          clearInterval(pingInterval);
          unsubLocal2();
        };
      } else {
        // No Redis — rely on in-memory bus only (localhost)
        // Keepalive ping every 30s
        const pingInterval = setInterval(() => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(`:ping\n\n`)); } catch { closed = true; }
        }, 30_000);

        cleanupFn = () => {
          closed = true;
          clearInterval(pingInterval);
          unsubLocal();
        };
      }
    },
    cancel() {
      closed = true;
      cleanupFn?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
