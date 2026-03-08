import type { StreamPlugin, DataPoint } from '@/types/stream';

export const wikipediaPlugin: StreamPlugin = {
  id: 'wikipedia',
  name: 'Wikipedia Edits',
  description: 'Live edits happening on English Wikipedia',
  category: 'information',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    const eventSource = new EventSource('/api/wiki-stream');

    // Create a queue for events since EventSource is callback-based
    const queue: DataPoint[] = [];
    let resolve: (() => void) | null = null;

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // Server already filters to en.wikipedia.org edits
        if (data.minor === false && !data.title.includes(':')) {
          const lengthDelta = (data.length?.new ?? 0) - (data.length?.old ?? 0);
          const dataPoint: DataPoint = {
            streamId: 'wikipedia',
            timestamp: Date.now(),
            fields: {
              title: data.title,
              titleLength: data.title.length,
              lengthDelta,
              absLengthDelta: Math.abs(lengthDelta),
              isBot: data.performer?.user_text?.includes('bot') ?? false,
              hasPerformer: !!data.performer,
            },
          };
          queue.push(dataPoint);
          if (resolve) {
            resolve();
            resolve = null;
          }
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
