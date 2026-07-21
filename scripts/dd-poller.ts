#!/usr/bin/env npx tsx
/**
 * Standalone Datadog → Streamscapes poller.
 *
 * Polls the Datadog List Spans API and/or Monitors API, and forwards data to
 * the Streamscapes OTLP endpoint. Runs outside the app — no DD credentials
 * on the server.
 *
 * Reads DD_API_KEY and DD_APPLICATION_KEY from .env (same file as the app).
 *
 * Usage:
 *   SS_API_KEY=zzz npx tsx --env-file .env scripts/dd-poller.ts
 *   SS_API_KEY=zzz npx tsx --env-file .env scripts/dd-poller.ts --monitors
 *   SS_API_KEY=zzz npx tsx --env-file .env scripts/dd-poller.ts --monitors-only
 *
 * Environment variables:
 *   DD_API_KEY             — Datadog API key (required)
 *   DD_APPLICATION_KEY     — Datadog application key (required, also accepts DD_APP_KEY)
 *   DD_SITE                — Datadog site (default: datadoghq.com)
 *   DD_QUERY               — Span search query (default: *)
 *   DD_MONITOR_TAGS        — Comma-separated monitor tags to filter (e.g. "team:infra,env:prod")
 *   DD_MONITOR_IDS         — Comma-separated monitor IDs to poll (e.g. "12345,67890")
 *   SS_API_KEY             — Streamscapes API key (required)
 *   SS_ENDPOINT            — OTLP endpoint (default: http://localhost:3000/api/ingest/otlp/v1/traces)
 *   POLL_INTERVAL_S        — Poll interval in seconds (default: 5)
 *   MONITOR_POLL_INTERVAL_S — Monitor poll interval in seconds (default: 30)
 */

const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY;
const DD_SITE = process.env.DD_SITE ?? 'datadoghq.com';
const DD_QUERY = process.env.DD_QUERY ?? '*';
const DD_MONITOR_TAGS = process.env.DD_MONITOR_TAGS ?? '';
const DD_MONITOR_IDS = process.env.DD_MONITOR_IDS ?? '';
const useRemote = process.argv.includes('--remote') || process.argv.includes('-r');
const enableMonitors = process.argv.includes('--monitors') || process.argv.includes('--monitors-only');
const monitorsOnly = process.argv.includes('--monitors-only');
const SS_API_KEY = useRemote ? (process.env.SS_PROD_API_KEY ?? process.env.SS_API_KEY) : (process.env.SS_LOCAL_API_KEY ?? process.env.SS_API_KEY);
const SS_PROD_ENDPOINT = process.env.SS_PROD_ENDPOINT ?? 'https://www.streamscapes.fm/api/ingest/otlp/v1/traces';
const SS_ENDPOINT = process.env.SS_ENDPOINT ?? (useRemote ? SS_PROD_ENDPOINT : 'http://localhost:3000/api/ingest/otlp/v1/traces');
const POLL_INTERVAL_S = Number(process.env.POLL_INTERVAL_S) || 5;
const MONITOR_POLL_INTERVAL_S = Number(process.env.MONITOR_POLL_INTERVAL_S) || 30;

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('Missing DD_API_KEY or DD_APPLICATION_KEY — check your .env');
  process.exit(1);
}
if (!SS_API_KEY) {
  console.error('Missing SS_API_KEY — generate one in the Streamscapes Connections panel');
  process.exit(1);
}

const LOOKBACK_MS = 60_000;
const PAGE_LIMIT = 50;
const seenIds = new Set<string>();

/** Map DD span type to OTLP SpanKind */
function ddTypeToKind(type: string | undefined): number {
  switch (type) {
    case 'web': return 2;
    case 'http': return 3;
    case 'db': return 3;
    case 'cache': return 3;
    default: return 0;
  }
}

interface OtlpSpan {
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  status: { code: number };
  attributes: Array<{ key: string; value: { stringValue: string } }>;
}

function convertSpan(span: Record<string, unknown>): OtlpSpan | null {
  const attrs = span?.attributes as Record<string, unknown> | undefined;
  if (!attrs) return null;

  const custom = (attrs.custom ?? {}) as Record<string, unknown>;
  const durationNs = Number(custom.duration ?? 0);
  const statusStr = String(attrs.status ?? 'ok');
  const service = String(attrs.service ?? 'unknown');
  const name = String(attrs.resource_name ?? attrs.operation_name ?? 'unknown');
  const now = Date.now();

  return {
    name,
    kind: ddTypeToKind(attrs.type as string | undefined),
    startTimeUnixNano: String(now * 1_000_000),
    endTimeUnixNano: String(now * 1_000_000 + durationNs),
    status: { code: statusStr === 'error' ? 2 : 1 },
    attributes: [
      { key: 'service.name', value: { stringValue: service } },
    ],
  };
}

async function poll(): Promise<void> {
  const now = new Date().toISOString();
  const from = new Date(Date.now() - LOOKBACK_MS).toISOString();

  try {
    const url = `https://api.${DD_SITE}/api/v2/spans/events/search`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': DD_API_KEY!,
        'DD-APPLICATION-KEY': DD_APP_KEY!,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            filter: { query: DD_QUERY, from, to: now },
            page: { limit: PAGE_LIMIT },
            sort: 'timestamp',
          },
          type: 'search_request',
        },
      }),
    });

    if (resp.status === 429) {
      console.warn(`[dd-poller] Rate limited (429), backing off`);
      return;
    }
    if (!resp.ok) {
      console.warn(`[dd-poller] DD API error: ${resp.status}`);
      return;
    }

    const json = await resp.json();
    const spans = json?.data ?? [];

    const newSpans: OtlpSpan[] = [];
    for (const span of spans) {
      const spanId = span?.id ?? span?.attributes?.span_id ?? JSON.stringify(span).slice(0, 100);
      const idStr = String(spanId);
      if (seenIds.has(idStr)) continue;
      seenIds.add(idStr);

      const otlp = convertSpan(span);
      if (otlp) newSpans.push(otlp);
    }

    // Prune seen IDs
    if (seenIds.size > 1000) {
      const arr = [...seenIds];
      seenIds.clear();
      for (const id of arr.slice(-500)) seenIds.add(id);
    }

    if (newSpans.length === 0) {
      process.stdout.write('.');
      return;
    }

    // Stagger with jitter for organic pacing
    const baseInterval = (POLL_INTERVAL_S * 1000) / newSpans.length;
    let cumulative = 0;

    for (const span of newSpans) {
      const jittered = baseInterval * (0.3 + Math.random() * 1.4);
      cumulative += jittered;
      const delay = Math.min(cumulative, POLL_INTERVAL_S * 1000 - 100);

      setTimeout(async () => {
        const body = {
          resourceSpans: [{
            resource: { attributes: span.attributes.map(a => ({ key: a.key, value: { stringValue: a.value.stringValue } })) },
            scopeSpans: [{ spans: [span] }],
          }],
        };

        try {
          const res = await fetch(`${SS_ENDPOINT}?source=datadog`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SS_API_KEY}`,
            },
            body: JSON.stringify(body),
          });
          const svc = span.attributes.find(a => a.key === 'service.name')?.value.stringValue ?? '?';
          if (res.ok) {
            const ts = new Date().toLocaleTimeString();
            console.log(`  ${ts}  ${svc} / ${span.name} (${span.status.code === 2 ? 'ERR' : 'OK'})`);
          } else {
            console.warn(`  [dd-poller] POST failed: ${res.status}`);
          }
        } catch (err) {
          console.warn(`  [dd-poller] POST error:`, err);
        }
      }, delay);
    }

    console.log(`\n[dd-poller] ${newSpans.length} new spans`);
  } catch (err) {
    console.warn('[dd-poller] Poll error:', err);
  }
}

// ─── Monitor polling ───────────────────────────────────────────────────────

/** Slugify a monitor name for use as a service name (e.g. "Fast Message Indexer Lag" → "fast-message-indexer-lag") */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Map DD monitor status to OTLP status code */
function monitorStatusToCode(status: string): number {
  switch (status) {
    case 'Alert': return 2;   // ERROR
    case 'Warn': return 2;    // ERROR (treat warn as error for sonification)
    case 'OK': return 1;
    default: return 0;        // UNSET (No Data, Unknown, etc.)
  }
}

// Track previous monitor states for transition detection
const prevMonitorStates = new Map<number, string>();

async function sendMonitorSpan(monitor: { id: number; name: string; status: string; tags: string[] }): Promise<void> {
  const service = slugify(monitor.name);
  const now = Date.now();
  const statusCode = monitorStatusToCode(monitor.status);

  // Duration encodes severity: OK=100ms, Warn=5000ms, Alert=10000ms, NoData=1ms
  const durationMs = monitor.status === 'Alert' ? 10000
    : monitor.status === 'Warn' ? 5000
    : monitor.status === 'OK' ? 100
    : 1;

  const span: OtlpSpan = {
    name: `monitor.${monitor.status.toLowerCase().replace(/\s+/g, '_')}`,
    kind: 0,
    startTimeUnixNano: String(now * 1_000_000),
    endTimeUnixNano: String((now + durationMs) * 1_000_000),
    status: { code: statusCode },
    attributes: [
      { key: 'service.name', value: { stringValue: service } },
      { key: 'monitor.id', value: { stringValue: String(monitor.id) } },
      { key: 'monitor.status', value: { stringValue: monitor.status } },
      ...(monitor.tags.length > 0
        ? [{ key: 'monitor.tags', value: { stringValue: monitor.tags.join(',') } }]
        : []),
    ],
  };

  const body = {
    resourceSpans: [{
      resource: { attributes: span.attributes.map(a => ({ key: a.key, value: { stringValue: a.value.stringValue } })) },
      scopeSpans: [{ spans: [span] }],
    }],
  };

  try {
    const res = await fetch(`${SS_ENDPOINT}?source=datadog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const ts = new Date().toLocaleTimeString();
    if (res.ok) {
      console.log(`  ${ts}  🔔 ${service} → ${monitor.status}`);
    } else {
      console.warn(`  [dd-monitors] POST failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`  [dd-monitors] POST error:`, err);
  }
}

async function pollMonitors(): Promise<void> {
  try {
    const params = new URLSearchParams();

    // Filter by specific IDs
    if (DD_MONITOR_IDS) {
      for (const id of DD_MONITOR_IDS.split(',').map(s => s.trim()).filter(Boolean)) {
        params.append('monitor_ids', id);
      }
    }

    // Filter by tags
    if (DD_MONITOR_TAGS) {
      params.set('monitor_tags', DD_MONITOR_TAGS);
    }

    const url = `https://api.${DD_SITE}/api/v1/monitor?${params.toString()}`;
    const resp = await fetch(url, {
      headers: {
        'DD-API-KEY': DD_API_KEY!,
        'DD-APPLICATION-KEY': DD_APP_KEY!,
      },
    });

    if (resp.status === 429) {
      console.warn(`[dd-monitors] Rate limited (429), backing off`);
      return;
    }
    if (!resp.ok) {
      console.warn(`[dd-monitors] DD API error: ${resp.status}`);
      return;
    }

    const monitors: Array<{
      id: number;
      name: string;
      overall_state: string;
      tags: string[];
    }> = await resp.json();

    if (monitors.length === 0) {
      process.stdout.write('m');
      return;
    }

    let transitions = 0;
    for (const m of monitors) {
      const prev = prevMonitorStates.get(m.id);
      const current = m.overall_state;

      // Always send on first poll; after that, only on state change
      if (prev === undefined || prev !== current) {
        if (prev !== undefined) {
          transitions++;
          console.log(`\n[dd-monitors] ${m.name}: ${prev} → ${current}`);
        }
        prevMonitorStates.set(m.id, current);
        await sendMonitorSpan({
          id: m.id,
          name: m.name,
          status: current,
          tags: m.tags ?? [],
        });
      }
    }

    if (transitions === 0) {
      process.stdout.write('m');
    }
  } catch (err) {
    console.warn('[dd-monitors] Poll error:', err);
  }
}

// ─── Main loop ─────────────────────────────────────────────────────────────

if (!monitorsOnly) {
  console.log(`[dd-poller] Polling spans from ${DD_SITE} every ${POLL_INTERVAL_S}s → ${SS_ENDPOINT}`);
  console.log(`[dd-poller] Query: ${DD_QUERY}`);
  poll();
  setInterval(poll, POLL_INTERVAL_S * 1000);
}

if (enableMonitors) {
  const filterDesc = DD_MONITOR_IDS
    ? `IDs: ${DD_MONITOR_IDS}`
    : DD_MONITOR_TAGS
      ? `tags: ${DD_MONITOR_TAGS}`
      : 'all monitors';
  console.log(`[dd-monitors] Polling monitors every ${MONITOR_POLL_INTERVAL_S}s (${filterDesc})`);
  pollMonitors();
  setInterval(pollMonitors, MONITOR_POLL_INTERVAL_S * 1000);
}
