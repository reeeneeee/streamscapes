import { ingestBus, type SpanMessage } from './ingest-bus';

/**
 * Datadog API polling adapter.
 *
 * Polls the Datadog List Spans API (v2) every 15 seconds and converts
 * results into SpanMessages published on the shared IngestBus.
 *
 * Lifecycle is tied to IngestBus subscriber count — polling only runs
 * while at least one SSE client is connected.
 */

export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string; // e.g. "datadoghq.com"
  query: string; // e.g. "service:synapse"
}

const POLL_INTERVAL_MS = 5_000; // 720 req/hr — backs off on 429
const PAGE_LIMIT = 50;

// Module-level state (survives across requests in same process)
export interface RecentSpan {
  serviceName: string;
  spanName: string;
  durationMs: number;
  isError: boolean;
  timestamp: number;
}

const MAX_RECENT = 5;
const LOOKBACK_MS = 60_000; // Look back 60s to catch DD indexing lag

const g = globalThis as unknown as {
  __ddConfig?: DatadogConfig | null;
  __ddInterval?: ReturnType<typeof setInterval> | null;
  __ddLastPollTime?: string | null;
  __ddSeenIds?: Set<string>;
  __ddRecentSpans?: RecentSpan[];
  __ddLastPollResult?: { time: string; status: number; spanCount: number } | null;
};

function getConfig(): DatadogConfig | null {
  return g.__ddConfig ?? null;
}

export function setDatadogConfig(config: DatadogConfig | null): void {
  g.__ddConfig = config;
  // If clearing config, stop polling
  if (!config && g.__ddInterval) {
    clearInterval(g.__ddInterval);
    g.__ddInterval = null;
    g.__ddLastPollTime = null;
    g.__ddSeenIds = new Set();
    g.__ddRecentSpans = [];
    g.__ddLastPollResult = null;
  }
  // If setting config and there are subscribers, start polling
  if (config && ingestBus.subscriberCount > 0 && !g.__ddInterval) {
    startPolling();
  }
}

export function getDatadogStatus(): {
  configured: boolean;
  polling: boolean;
  site?: string;
  query?: string;
  recentSpans: RecentSpan[];
  lastPoll?: { time: string; status: number; spanCount: number } | null;
} {
  const config = getConfig();
  return {
    configured: !!config,
    polling: !!g.__ddInterval,
    site: config?.site,
    query: config?.query,
    recentSpans: g.__ddRecentSpans ?? [],
    lastPoll: g.__ddLastPollResult ?? null,
  };
}

/**
 * Called by the SSE relay when subscriber count changes.
 * Start polling when first subscriber connects (and DD is configured),
 * stop when last subscriber disconnects.
 */
export function checkPollingLifecycle(): void {
  const config = getConfig();
  if (!config) return;

  if (ingestBus.subscriberCount > 0 && !g.__ddInterval) {
    startPolling();
  } else if (ingestBus.subscriberCount === 0 && g.__ddInterval) {
    clearInterval(g.__ddInterval);
    g.__ddInterval = null;
    g.__ddLastPollTime = null;
  }
}

function startPolling(): void {
  if (g.__ddInterval) return;
  // Poll immediately, then on interval
  pollDatadog();
  g.__ddInterval = setInterval(pollDatadog, POLL_INTERVAL_MS);
}

async function pollDatadog(): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const now = new Date().toISOString();
  // Always look back 60s to catch DD indexing lag; deduplicate via seen IDs
  const from = new Date(Date.now() - LOOKBACK_MS).toISOString();
  if (!g.__ddSeenIds) g.__ddSeenIds = new Set();

  try {
    const url = `https://api.${config.site}/api/v2/spans/events/search`;
    const body = {
      data: {
        attributes: {
          filter: {
            query: config.query || '*',
            from,
            to: now,
          },
          page: { limit: PAGE_LIMIT },
          sort: 'timestamp',
        },
        type: 'search_request',
      },
    };

    console.log('[DatadogAdapter] Request:', JSON.stringify({ url, query: config.query, from, to: now }));

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.apiKey,
        'DD-APPLICATION-KEY': config.appKey,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      console.warn('[DatadogAdapter] Rate limited, skipping cycle');
      g.__ddLastPollResult = { time: now, status: 429, spanCount: 0 };
      return;
    }

    if (!resp.ok) {
      console.warn(`[DatadogAdapter] API error: ${resp.status} ${resp.statusText}`);
      g.__ddLastPollResult = { time: now, status: resp.status, spanCount: 0 };
      return;
    }

    const json = await resp.json();
    const spans = json?.data ?? [];
    g.__ddLastPollResult = { time: now, status: 200, spanCount: spans.length };
    if (spans.length === 0) {
      console.log('[DatadogAdapter] 0 spans. Response keys:', Object.keys(json), 'meta:', JSON.stringify(json?.meta)?.slice(0, 300));
    }

    if (!g.__ddRecentSpans) g.__ddRecentSpans = [];

    // Collect new (unseen) spans first
    const newSpans: SpanMessage[] = [];
    for (const span of spans) {
      const spanId = span?.id ?? span?.attributes?.span_id ?? JSON.stringify(span).slice(0, 100);
      const idStr = String(spanId);
      if (g.__ddSeenIds!.has(idStr)) continue;
      g.__ddSeenIds!.add(idStr);

      const msg = convertSpan(span);
      if (msg) newSpans.push(msg);
    }

    // Stagger publishing with jitter so spans arrive at an organic pace
    if (newSpans.length > 0) {
      const baseInterval = POLL_INTERVAL_MS / newSpans.length;
      let cumulative = 0;
      newSpans.forEach((msg) => {
        // Random jitter: 0.3x–1.7x the base interval
        const jittered = baseInterval * (0.3 + Math.random() * 1.4);
        cumulative += jittered;
        const delay = Math.min(cumulative, POLL_INTERVAL_MS - 100);
        setTimeout(() => {
          ingestBus.publish(msg);
          g.__ddRecentSpans!.unshift({
            serviceName: msg.serviceName,
            spanName: msg.spanName,
            durationMs: msg.durationMs,
            isError: msg.statusCode === 2,
            timestamp: msg.timestamp,
          });
          g.__ddRecentSpans = g.__ddRecentSpans!.slice(0, MAX_RECENT);
        }, delay);
      });
      console.log(`[DatadogAdapter] Staggering ${newSpans.length} spans over ${(POLL_INTERVAL_MS / 1000).toFixed(0)}s (jittered)`);
    }

    // Prune seen IDs to prevent memory growth (keep last 1000)
    if (g.__ddSeenIds!.size > 1000) {
      const arr = [...g.__ddSeenIds!];
      g.__ddSeenIds = new Set(arr.slice(-500));
    }

    g.__ddLastPollTime = now;
  } catch (err) {
    console.warn('[DatadogAdapter] Poll error:', err);
  }
}

/** Map DD span type to closest OTLP SpanKind */
function ddTypeToKind(type: string | undefined): number {
  switch (type) {
    case 'web': return 2;     // SERVER
    case 'http': return 3;    // CLIENT
    case 'db': return 3;      // CLIENT
    case 'cache': return 3;   // CLIENT
    case 'custom': return 0;  // UNSPECIFIED
    default: return 0;
  }
}

function convertSpan(span: Record<string, unknown>): SpanMessage | null {
  const attrs = span?.attributes as Record<string, unknown> | undefined;
  if (!attrs) return null;

  const custom = (attrs.custom ?? {}) as Record<string, unknown>;
  const durationNs = Number(custom.duration ?? 0);
  const statusStr = String(attrs.status ?? 'ok');

  return {
    serviceName: String(attrs.service ?? 'unknown'),
    spanName: String(attrs.resource_name ?? attrs.operation_name ?? 'unknown'),
    durationMs: durationNs / 1_000_000,
    statusCode: statusStr === 'error' ? 2 : 1,
    kind: ddTypeToKind(attrs.type as string | undefined),
    timestamp: Date.now(),
    errorMessage: statusStr === 'error' ? String(custom.error_message ?? custom['error.message'] ?? '') || undefined : undefined,
    httpStatusCode: custom['http.status_code'] ? Number(custom['http.status_code']) : undefined,
    source: 'datadog',
  };
}
