#!/usr/bin/env npx tsx
/**
 * Standalone Datadog → Streamscapes poller.
 *
 * Polls the Datadog List Spans API and forwards spans to the Streamscapes
 * OTLP endpoint. Runs outside the app — no DD credentials on the server.
 *
 * Reads DD_API_KEY and DD_APPLICATION_KEY from .env (same file as the app).
 *
 * Usage:
 *   SS_API_KEY=zzz npx tsx --env-file .env scripts/dd-poller.ts
 *
 * Environment variables:
 *   DD_API_KEY             — Datadog API key (required)
 *   DD_APPLICATION_KEY     — Datadog application key (required, also accepts DD_APP_KEY)
 *   DD_SITE                — Datadog site (default: datadoghq.com)
 *   DD_QUERY               — Span search query (default: *)
 *   SS_API_KEY             — Streamscapes API key (required)
 *   SS_ENDPOINT            — OTLP endpoint (default: http://localhost:3000/api/ingest/otlp/v1/traces)
 *   POLL_INTERVAL_S        — Poll interval in seconds (default: 5)
 */

const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY;
const DD_SITE = process.env.DD_SITE ?? 'datadoghq.com';
const DD_QUERY = process.env.DD_QUERY ?? '*';
const useRemote = process.argv.includes('--remote') || process.argv.includes('-r');
const SS_API_KEY = useRemote ? (process.env.SS_PROD_API_KEY ?? process.env.SS_API_KEY) : (process.env.SS_LOCAL_API_KEY ?? process.env.SS_API_KEY);
const SS_PROD_ENDPOINT = process.env.SS_PROD_ENDPOINT ?? 'https://www.streamscapes.fm/api/ingest/otlp/v1/traces';
const SS_ENDPOINT = process.env.SS_ENDPOINT ?? (useRemote ? SS_PROD_ENDPOINT : 'http://localhost:3000/api/ingest/otlp/v1/traces');
const POLL_INTERVAL_S = Number(process.env.POLL_INTERVAL_S) || 5;

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

// Main loop
console.log(`[dd-poller] Polling ${DD_SITE} every ${POLL_INTERVAL_S}s → ${SS_ENDPOINT}`);
console.log(`[dd-poller] Query: ${DD_QUERY}`);
poll();
setInterval(poll, POLL_INTERVAL_S * 1000);
