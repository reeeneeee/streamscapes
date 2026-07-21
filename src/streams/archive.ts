import type { StreamPlugin, DataPoint } from '@/types/stream';

/**
 * Internet Archive changes stream plugin.
 * Polls the IA Changes API for recent changes and yields them as events
 * on a single 'archive' channel. Each mediatype maps to a different
 * pitch region via the mediatypeIndex field.
 */

// Assign each mediatype a numeric index for scale mapping
const MEDIATYPE_INDEX: Record<string, number> = {
  texts: 0,
  audio: 1,
  movies: 2,
  software: 3,
  web: 4,
  image: 5,
  data: 6,
  collection: 7,
};

export const archivePlugin: StreamPlugin = {
  id: 'archive',
  name: 'Internet Archive',
  description: 'Real-time changes to the Internet Archive',
  category: 'information',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    while (!signal.aborted) {
      try {
        console.log('[archive] polling...');
        const response = await fetch('/api/streams/archive', { signal });
        console.log('[archive] response status:', response.status);
        if (!response.ok) {
          console.warn(`[archive] upstream error: ${response.status}`);
          yield {
            streamId: 'archive',
            timestamp: Date.now(),
            fields: {
              title: `offline (${response.status})`,
              titleLength: 0,
              mediatypeIndex: 0,
              _statusOnly: 1,
            },
          };
          await sleep(30_000, signal);
          continue;
        }
        {
          const data = await response.json();
          console.log('[archive] got', data.items?.length ?? 0, 'items, doSleep:', data.doSleep);
          const items: Array<{
            identifier: string;
            mediatype: string;
            title?: string;
            collection?: string;
            publicdate?: string;
            downloads?: number;
          }> = data.items ?? [];

          // Distribute items evenly across the full poll interval with per-slot jitter
          // so each blob appears at a natural-feeling but well-spaced moment
          const totalInterval = data.doSleep ? 20_000 : 15_000;
          const slotMs = items.length > 0 ? totalInterval / items.length : totalInterval;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const mediatype = item.mediatype ?? 'unknown';
            const mediatypeIndex = MEDIATYPE_INDEX[mediatype] ?? 6;

            // Item age in years — unknown publicdate counts as brand new
            const publicMs = item.publicdate ? Date.parse(item.publicdate) : NaN;
            const ageYears = Number.isFinite(publicMs)
              ? Math.max(0, (Date.now() - publicMs) / 31_557_600_000)
              : 0;

            yield {
              streamId: 'archive',
              timestamp: Date.now(),
              fields: {
                identifier: item.identifier,
                mediatype,
                mediatypeIndex,
                title: item.title ?? item.identifier,
                titleLength: (item.title ?? item.identifier).length,
                collection: item.collection ?? '',
                downloads: Math.max(1, item.downloads ?? 1),
                ageYears,
              },
            };

            // Wait ~slotMs with ±30% jitter
            if (i < items.length - 1) {
              const jitter = slotMs * (0.7 + Math.random() * 0.6);
              await sleep(jitter, signal);
            }
          }
        }
        // Items were already distributed across the interval — go straight to next poll
        continue;
      } catch (err) {
        if (signal.aborted) return;
        console.error('[archive] error:', err);
      }

      // Only sleep on error/empty response
      await sleep(15_000, signal);
    }
  },
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
