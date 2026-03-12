import type { StreamPlugin, DataPoint } from '@/types/stream';
import type { SpanMessage } from '@/lib/ingest-bus';
import type { IngestSource } from '@/lib/ingest-bus';

const SOURCE_PREFIX: Record<IngestSource, string> = {
  otlp: 'otlp',
  datadog: 'dd',
  github: 'github',
  notify: 'notify',
};

export const ingestPlugin: StreamPlugin = {
  id: 'otlp',
  name: 'Ingest',
  description: 'Live traces from OTLP, Datadog, webhooks, and notifications',
  category: 'observability',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    const eventSource = new EventSource('/api/ingest/stream');

    const queue: DataPoint[] = [];
    let resolve: (() => void) | null = null;

    eventSource.addEventListener('error', () => {
      // SSE auto-reconnects; silence expected errors
    });

    const handler = (event: MessageEvent) => {
      try {
        const msg: SpanMessage = JSON.parse(event.data);
        const prefix = SOURCE_PREFIX[msg.source ?? 'otlp'];
        const streamId = `${prefix}:${msg.serviceName}`;
        const dataPoint: DataPoint = {
          streamId,
          timestamp: msg.timestamp,
          fields: {
            durationMs: msg.durationMs,
            noteDurationMs: msg.durationMs,
            isError: msg.statusCode === 2 ? 1 : 0,
            statusCode: msg.statusCode,
            spanKind: msg.kind,
            spanName: msg.spanName,
            ...(msg.httpStatusCode !== undefined && { httpStatusCode: msg.httpStatusCode }),
            ...(msg.errorMessage !== undefined && { errorMessage: msg.errorMessage }),
            ...(msg.replay && { replay: 1 }),
          },
        };
        queue.push(dataPoint);
        if (resolve) {
          resolve();
          resolve = null;
        }
      } catch {
        // Skip malformed messages
      }
    };

    eventSource.addEventListener('message', handler);

    signal.addEventListener('abort', () => {
      eventSource.removeEventListener('message', handler);
      eventSource.close();
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    try {
      while (!signal.aborted) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => { resolve = r; });
        }
      }
    } finally {
      eventSource.close();
    }
  },
};
