export type IngestSource = 'otlp' | 'datadog' | 'github' | 'notify';

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
}

type Listener = (msg: SpanMessage) => void;

class IngestBus {
  private channels = new Map<string, Set<Listener>>();

  /** Publish a message to a specific user's channel */
  publishToUser(userId: string, msg: SpanMessage) {
    const listeners = this.channels.get(userId);
    if (listeners) {
      for (const fn of listeners) fn(msg);
    }
  }

  /** Subscribe to a specific user's channel. Returns unsubscribe function. */
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
