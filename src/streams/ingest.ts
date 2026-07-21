import type { StreamPlugin, DataPoint } from '@/types/stream';
import type { SpanMessage } from '@/lib/ingest-bus';
import type { IngestSource } from '@/lib/ingest-bus';

const SOURCE_PREFIX: Record<IngestSource, string> = {
  otlp: 'otlp',
  datadog: 'dd',
  github: 'github',
  notify: 'notify',
  browser: 'chrome',
  system: 'system',
  watch: 'watch',
};

export const ingestPlugin: StreamPlugin = {
  id: 'otlp',
  name: 'Ingest',
  description: 'Live traces from OTLP, Datadog, webhooks, and notifications',
  category: 'observability',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    const queue: DataPoint[] = [];
    let resolve: (() => void) | null = null;

    function push(dp: DataPoint) {
      queue.push(dp);
      if (resolve) { resolve(); resolve = null; }
    }

    function createSSE(): EventSource {
      const apiKey = typeof window !== 'undefined'
        ? localStorage.getItem('ss-anon-api-key')
        : null;
      const sseUrl = apiKey
        ? `/api/ingest/stream?apiKey=${encodeURIComponent(apiKey)}`
        : '/api/ingest/stream';
      return new EventSource(sseUrl);
    }

    function parseMessage(event: MessageEvent) {
      try {
        const msg: SpanMessage = JSON.parse(event.data);
        const source = msg.source ?? 'otlp';
        const prefix = SOURCE_PREFIX[source];
        const streamId = source === 'system' || source === 'watch'
          ? `${prefix}:${msg.spanName || msg.serviceName}`
          : `${prefix}:${msg.serviceName}`;
        push({
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
            ...(msg.attributes ?? {}),
          },
        });
      } catch { /* skip malformed */ }
    }

    let es = createSSE();
    es.addEventListener('message', parseMessage);

    // Reconnect SSE when anon API key changes (e.g. after generating a key)
    const onKeyChange = () => {
      es.removeEventListener('message', parseMessage);
      es.close();
      es = createSSE();
      es.addEventListener('message', parseMessage);
    };
    window.addEventListener('ss-anon-key-changed', onKeyChange);

    signal.addEventListener('abort', () => {
      window.removeEventListener('ss-anon-key-changed', onKeyChange);
      es.removeEventListener('message', parseMessage);
      es.close();
      if (resolve) { resolve(); resolve = null; }
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
      window.removeEventListener('ss-anon-key-changed', onKeyChange);
      es.close();
    }
  },
};
