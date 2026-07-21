import { redis } from './redis';

export type IngestSource = 'otlp' | 'datadog' | 'github' | 'notify' | 'browser' | 'system' | 'watch';

export interface SpanMessage {
  readonly serviceName: string;
  readonly spanName: string;
  readonly durationMs: number;
  readonly statusCode: number; // 0=UNSET, 1=OK, 2=ERROR
  readonly kind: number; // 0-5 (OTLP SpanKind)
  readonly timestamp: number;
  readonly errorMessage?: string;
  readonly httpStatusCode?: number;
  readonly source?: IngestSource;
  readonly replay?: boolean;
  readonly attributes?: Record<string, string | number | boolean>;
}

/** Redis stream key for a user's ingest messages */
export function streamKey(userId: string): string {
  return `ingest:${userId}`;
}

/** Max entries per user stream — older entries are auto-trimmed */
const STREAM_MAX_LEN = 500;

type Listener = (msg: SpanMessage) => void;

class IngestBus {
  private channels = new Map<string, Set<Listener>>();

  /** Publish a message to a specific user's channel.
   *  Delivers to in-memory listeners AND writes to Redis stream. */
  publishToUser(userId: string, msg: SpanMessage) {
    // In-memory delivery (same-isolate — works on localhost, best-effort on Vercel)
    const listeners = this.channels.get(userId);
    if (listeners) {
      for (const fn of listeners) fn(msg);
    }

    // Redis stream delivery (cross-isolate — required for Vercel)
    if (redis) {
      redis.xadd(streamKey(userId), '*', { data: JSON.stringify(msg) }, {
        trim: { type: 'MAXLEN', threshold: STREAM_MAX_LEN, comparison: '~' as const },
      }).catch(() => {
        // Silently drop — Redis is best-effort for real-time sonification
      });
    }
  }

  /** Subscribe to a specific user's channel (in-memory only). Returns unsubscribe function. */
  subscribeToUser(userId: string, fn: Listener): () => void {
    let set = this.channels.get(userId);
    if (!set) {
      set = new Set();
      this.channels.set(userId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.channels.delete(userId);
    };
  }

  /** Get subscriber count for a specific user */
  subscriberCountForUser(userId: string): number {
    return this.channels.get(userId)?.size ?? 0;
  }

  /** Total subscriber count across all channels */
  get subscriberCount(): number {
    let total = 0;
    for (const set of this.channels.values()) total += set.size;
    return total;
  }
}

// globalThis stash survives HMR during next dev (same pattern as global.prisma)
const g = globalThis as unknown as { __ingestBus?: IngestBus };
g.__ingestBus ??= new IngestBus();

export const ingestBus: IngestBus = g.__ingestBus;
