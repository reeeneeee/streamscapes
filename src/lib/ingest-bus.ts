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
  private listeners = new Set<Listener>();

  publish(msg: SpanMessage) {
    for (const fn of this.listeners) {
      fn(msg);
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get subscriberCount() {
    return this.listeners.size;
  }
}

// globalThis stash survives HMR during next dev (same pattern as global.prisma)
const g = globalThis as unknown as { __ingestBus?: IngestBus };
g.__ingestBus ??= new IngestBus();

export const ingestBus: IngestBus = g.__ingestBus;
