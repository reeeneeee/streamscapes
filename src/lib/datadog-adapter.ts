import { ingestBus, type SpanMessage } from './ingest-bus';

/**
 * Datadog API polling adapter (per-user).
 *
 * Polls the Datadog List Spans API (v2) and publishes SpanMessages
 * to each user's IngestBus channel. Each user has independent config,
 * polling interval, dedup set, and recent spans buffer.
 */

export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string; // e.g. "datadoghq.com"
  query: string; // e.g. "service:synapse"
}

const POLL_INTERVAL_MS = 5_000;
const PAGE_LIMIT = 50;

export interface RecentSpan {
  serviceName: string;
  spanName: string;
  durationMs: number;
  isError: boolean;
  timestamp: number;
}

const MAX_RECENT = 5;
const LOOKBACK_MS = 60_000;
const IDLE_TIMEOUT_MS = 5 * 60_000; // 5 minutes

interface AdapterState {
  config: DatadogConfig;
  interval: ReturnType<typeof setInterval> | null;
  seenIds: Set<string>;
  recentSpans: RecentSpan[];
  lastPollResult: { time: string; status: number; spanCount: number } | null;
  lastActivity: number;
}

// Per-user state keyed by userId, survives HMR
const g = globalThis as unknown as { __ddAdapters?: Map<string, AdapterState> };
g.__ddAdapters ??= new Map();
const adapters = g.__ddAdapters;

function getState(userId: string): AdapterState | undefined {
  return adapters.get(userId);
}

export function setDatadogConfig(userId: string, config: DatadogConfig | null): void {
  if (!config) {
    // Clear — stop polling and remove state
    const state = adapters.get(userId);
    if (state?.interval) clearInterval(state.interval);
    adapters.delete(userId);
    return;
  }

  let state = adapters.get(userId);
  if (state) {
    // Update config, keep existing polling state
    state.config = config;
    state.lastActivity = Date.now();
  } else {
    state = {
      config,
      interval: null,
      seenIds: new Set(),
      recentSpans: [],
      lastPollResult: null,
      lastActivity: Date.now(),
    };
    adapters.set(userId, state);
  }

  // Start polling if user has subscribers
  if (ingestBus.subscriberCountForUser(userId) > 0 && !state.interval) {
    startPolling(userId, state);
  }
}

export function getDatadogStatus(userId: string): {
  configured: boolean;
  polling: boolean;
  site?: string;
  query?: string;
  recentSpans: RecentSpan[];
  lastPoll: { time: string; status: number; spanCount: number } | null;
} {
  const state = getState(userId);
  if (!state) {
    return { configured: false, polling: false, recentSpans: [], lastPoll: null };
  }
  return {
    configured: true,
    polling: !!state.interval,
    site: state.config.site,
    query: state.config.query,
    recentSpans: state.recentSpans,
    lastPoll: state.lastPollResult,
  };
}

/**
 * Called by SSE relay when subscriber count changes for a user.
 * Start polling when first subscriber connects, stop when last disconnects.
 */
export function checkPollingLifecycle(userId: string): void {
  const state = getState(userId);
  if (!state) return;

  const count = ingestBus.subscriberCountForUser(userId);
  if (count > 0 && !state.interval) {
    startPolling(userId, state);
  } else if (count === 0 && state.interval) {
    clearInterval(state.interval);
    state.interval = null;
  }
}

function startPolling(userId: string, state: AdapterState): void {
  if (state.interval) return;
  pollDatadog(userId, state);
  state.interval = setInterval(() => pollDatadog(userId, state), POLL_INTERVAL_MS);

  // Idle timeout: stop polling if no activity for 5 minutes
  const checkIdle = setInterval(() => {
    if (Date.now() - state.lastActivity > IDLE_TIMEOUT_MS) {
      clearInterval(checkIdle);
      if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
        console.log(`[DatadogAdapter] Idle timeout for user ${userId.slice(0, 8)}…`);
      }
    }
  }, 60_000);
}

async function pollDatadog(userId: string, state: AdapterState): Promise<void> {
  state.lastActivity = Date.now();
  const { config } = state;

  const now = new Date().toISOString();
  const from = new Date(Date.now() - LOOKBACK_MS).toISOString();

  try {
    const url = `https://api.${config.site}/api/v2/spans/events/search`;
    const body = {
      data: {
        attributes: {
          filter: { query: config.query || '*', from, to: now },
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
      state.lastPollResult = { time: now, status: 429, spanCount: 0 };
      return;
    }
    if (!resp.ok) {
      state.lastPollResult = { time: now, status: resp.status, spanCount: 0 };
      return;
    }

    const json = await resp.json();
    const spans = json?.data ?? [];
    state.lastPollResult = { time: now, status: 200, spanCount: spans.length };

    const newSpans: SpanMessage[] = [];
    for (const span of spans) {
      const spanId = span?.id ?? span?.attributes?.span_id ?? JSON.stringify(span).slice(0, 100);
      const idStr = String(spanId);
      if (state.seenIds.has(idStr)) continue;
      state.seenIds.add(idStr);

      const msg = convertSpan(span);
      if (msg) newSpans.push(msg);
    }

    // Stagger with jitter for organic pacing
    if (newSpans.length > 0) {
      const baseInterval = POLL_INTERVAL_MS / newSpans.length;
      let cumulative = 0;
      newSpans.forEach((msg) => {
        const jittered = baseInterval * (0.3 + Math.random() * 1.4);
        cumulative += jittered;
        const delay = Math.min(cumulative, POLL_INTERVAL_MS - 100);
        setTimeout(() => {
          ingestBus.publishToUser(userId, msg);
          state.recentSpans.unshift({
            serviceName: msg.serviceName,
            spanName: msg.spanName,
            durationMs: msg.durationMs,
            isError: msg.statusCode === 2,
            timestamp: msg.timestamp,
          });
          if (state.recentSpans.length > MAX_RECENT) state.recentSpans.length = MAX_RECENT;
        }, delay);
      });
    }

    // Prune seen IDs
    if (state.seenIds.size > 1000) {
      const arr = [...state.seenIds];
      state.seenIds = new Set(arr.slice(-500));
    }
  } catch (err) {
    console.warn('[DatadogAdapter] Poll error:', err);
  }
}

/** Map DD span type to closest OTLP SpanKind */
function ddTypeToKind(type: string | undefined): number {
  switch (type) {
    case 'web': return 2;
    case 'http': return 3;
    case 'db': return 3;
    case 'cache': return 3;
    case 'custom': return 0;
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
