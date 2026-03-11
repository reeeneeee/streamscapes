import type { StreamPlugin, DataPoint } from '@/types/stream';
import type { SpanMessage } from '@/lib/ingest-bus';

export const otlpPlugin: StreamPlugin = {
  id: 'otlp',
  name: 'OpenTelemetry',
  description: 'Live OTLP traces from your instrumented services',
  category: 'observability',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    const eventSource = new EventSource('/api/ingest/stream');

    const queue: DataPoint[] = [];
    let resolve: (() => void) | null = null;

    const handler = (event: MessageEvent) => {
      try {
        const msg: SpanMessage = JSON.parse(event.data);
        const streamId = `otlp:${msg.serviceName}`;
        const dataPoint: DataPoint = {
          streamId,
          timestamp: msg.timestamp,
          fields: {
            durationMs: msg.durationMs,
            noteDurationMs: msg.durationMs,
            isError: msg.statusCode === 2,
            statusCode: msg.statusCode,
            spanKind: msg.kind,
            spanName: msg.spanName,
            ...(msg.httpStatusCode !== undefined && { httpStatusCode: msg.httpStatusCode }),
            ...(msg.errorMessage !== undefined && { errorMessage: msg.errorMessage }),
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
