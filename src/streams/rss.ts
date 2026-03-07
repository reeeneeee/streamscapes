import type { StreamPlugin, DataPoint } from '@/types/stream';

/**
 * RSS/Atom feed stream plugin.
 * Polls a public RSS-to-JSON proxy for new items and yields them as DataPoints.
 * Uses a set of curated feed URLs for interesting real-time content.
 */

const DEFAULT_FEEDS = [
  'https://news.ycombinator.com/rss',
  'https://www.reddit.com/r/worldnews/.rss',
];

export function createRssPlugin(feedUrls: string[] = DEFAULT_FEEDS): StreamPlugin {
  return {
    id: 'rss',
    name: 'RSS Feeds',
    description: 'New articles from RSS/Atom feeds',
    category: 'information',

    async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
      const seenIds = new Set<string>();

      while (!signal.aborted) {
        for (const feedUrl of feedUrls) {
          if (signal.aborted) return;
          try {
            // Use a public RSS-to-JSON API
            const response = await fetch(
              `/api/streams/rss?url=${encodeURIComponent(feedUrl)}`,
              { signal }
            );
            if (!response.ok) continue;

            const data = await response.json();
            const items: { link?: string; title?: string; contentSnippet?: string; content?: string; enclosure?: unknown }[] = data.items ?? [];

            for (const item of items) {
              const id = item.link ?? item.title ?? '';
              if (seenIds.has(id)) continue;
              seenIds.add(id);

              const title = item.title ?? 'Untitled';
              const contentLength = (item.contentSnippet ?? item.content ?? '').length;

              yield {
                streamId: 'rss',
                timestamp: Date.now(),
                fields: {
                  title,
                  titleLength: title.length,
                  contentLength,
                  feedUrl,
                  hasImage: item.enclosure ? 1 : 0,
                },
              };
            }
          } catch {
            if (signal.aborted) return;
          }
        }

        // Poll every 2 minutes
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2 * 60_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    },
  };
}
