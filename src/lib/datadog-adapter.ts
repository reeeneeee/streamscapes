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

const POLL_INTERVAL_MS = 15_000; // 240 req/hr, under 300 limit
const PAGE_LIMIT = 50;

// Module-level state (survives across requests in same process)
const g = globalThis as unknown as {
  __ddConfig?: DatadogConfig | null;
  __ddInterval?: ReturnType<typeof setInterval> | null;
  __ddLastPollTime?: string | null;
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
} {
  const config = getConfig();
  return {
    configured: !!config,
    polling: !!g.__ddInterval,
    site: config?.site,
    query: config?.query,
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
  const from = g.__ddLastPollTime ?? new Date(Date.now() - POLL_INTERVAL_MS).toISOString();

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
      // Rate limited — back off by skipping this cycle
      console.warn('[DatadogAdapter] Rate limited, skipping cycle');
      return;
    }

    if (!resp.ok) {
      console.warn(`[DatadogAdapter] API error: ${resp.status} ${resp.statusText}`);
      return;
    }

    const json = await resp.json();
    const spans = json?.data ?? [];

    for (const span of spans) {
      const msg = convertSpan(span);
      if (msg) ingestBus.publish(msg);
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
  };
}
