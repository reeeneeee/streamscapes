#!/usr/bin/env npx tsx
/**
 * Streamscapes Agent — consolidated poller daemon.
 *
 * Runs all local signal pollers in a single process:
 *   - macOS notifications (sqlite3)
 *   - Datadog spans (API)
 *
 * Usage:
 *   npx tsx --env-file .env scripts/agent.ts              # local dev
 *   npx tsx --env-file .env scripts/agent.ts --remote      # prod
 *   npx tsx --env-file .env scripts/agent.ts --modules notif,dd   # pick modules
 *
 * Env:
 *   SS_API_KEY / SS_LOCAL_API_KEY / SS_PROD_API_KEY — auth token
 *   DD_API_KEY, DD_APPLICATION_KEY                  — Datadog (optional)
 *   SS_ENDPOINT / SS_PROD_ENDPOINT                  — override ingest URL
 */

import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const useRemote = process.argv.includes('--remote') || process.argv.includes('-r');
const SS_API_KEY = useRemote
  ? (process.env.SS_PROD_API_KEY ?? process.env.SS_API_KEY)
  : (process.env.SS_LOCAL_API_KEY ?? process.env.SS_API_KEY);
const SS_PROD_ENDPOINT = process.env.SS_PROD_ENDPOINT ?? 'https://www.streamscapes.fm/api/ingest/otlp/v1/traces';
const SS_ENDPOINT = process.env.SS_ENDPOINT ?? (useRemote ? SS_PROD_ENDPOINT : 'http://localhost:3000/api/ingest/otlp/v1/traces');

if (!SS_API_KEY) {
  console.error('Missing SS_API_KEY — generate one in the Streamscapes Connections panel');
  process.exit(1);
}

// Parse --modules flag (comma-separated), default = all available
const modulesArg = process.argv.find(a => a.startsWith('--modules='))?.slice(10)
  ?? process.argv[process.argv.indexOf('--modules') + 1];
const requestedModules = modulesArg ? new Set(modulesArg.split(',').map(m => m.trim())) : null;

function moduleEnabled(name: string, requiresEnv?: () => boolean): boolean {
  if (requestedModules && !requestedModules.has(name)) return false;
  if (requiresEnv && !requiresEnv()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Shared: OTLP span POST
// ---------------------------------------------------------------------------

async function postSpan(
  source: string,
  serviceName: string,
  spanName: string,
  fields: Record<string, string | number>,
  extra?: { timestampMs?: number; statusCode?: number }
) {
  const ts = extra?.timestampMs ?? Date.now();
  const startNano = String(ts * 1_000_000);
  const endNano = String((ts + 1) * 1_000_000);

  const body = {
    resourceSpans: [{
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
      },
      scopeSpans: [{
        spans: [{
          name: spanName,
          kind: 0,
          startTimeUnixNano: startNano,
          endTimeUnixNano: endNano,
          status: { code: extra?.statusCode ?? 1 },
          attributes: Object.entries(fields).map(([key, val]) => ({
            key,
            value: typeof val === 'number'
              ? { intValue: Math.round(val) }
              : { stringValue: String(val) },
          })),
        }],
      }],
    }],
  };

  try {
    const res = await fetch(`${SS_ENDPOINT}?source=${source}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const tag = (mod: string) => `[${mod}]`;

// ---------------------------------------------------------------------------
// Module: macOS Notifications
// ---------------------------------------------------------------------------

function startNotifPoller() {
  const DB_PATH = join(homedir(), 'Library/Group Containers/group.com.apple.usernoted/db2/db');
  const MAC_EPOCH_OFFSET = 978307200;
  const POLL_S = Number(process.env.NOTIF_POLL_INTERVAL_S) || 3;

  const seenIds = new Set<number>();
  let lastDate = Date.now() / 1000 - MAC_EPOCH_OFFSET;

  function appName(bundleId: string): string {
    const parts = String(bundleId).split('.');
    return parts[parts.length - 1] || bundleId;
  }

  function getContent(recId: number): { title?: string; body?: string } {
    try {
      execSync(
        `sqlite3 "${DB_PATH}" "SELECT writefile('/tmp/ss_notif.plist', data) FROM record WHERE rec_id = ${recId};"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      const raw = execSync('plutil -p /tmp/ss_notif.plist', { encoding: 'utf-8', timeout: 5000 });
      const extract = (key: string) => raw.match(new RegExp(`"${key}"\\s*=>\\s*"([^"]*)"`, 'm'))?.[1];
      return { title: extract('titl'), body: extract('body') };
    } catch { return {}; }
  }

  async function poll() {
    try {
      const query = `SELECT r.rec_id, a.identifier, r.delivered_date FROM record r JOIN app a ON r.app_id = a.app_id WHERE r.delivered_date > ${lastDate} ORDER BY r.delivered_date ASC LIMIT 50;`;
      const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (!result) { process.stdout.write('.'); return; }

      const rows = JSON.parse(result) as Array<{ rec_id: number; identifier: string; delivered_date: number }>;
      const newRows = rows.filter(r => !seenIds.has(r.rec_id));
      if (!newRows.length) { process.stdout.write('.'); return; }

      console.log(`\n${tag('notif')} ${newRows.length} new`);
      for (const row of newRows) {
        seenIds.add(row.rec_id);
        lastDate = Math.max(lastDate, row.delivered_date);
        const svc = appName(row.identifier);
        const content = getContent(row.rec_id);
        const name = content.title ? `${svc}: ${content.title}` : svc;
        const tsMs = (row.delivered_date + MAC_EPOCH_OFFSET) * 1000;
        const ok = await postSpan('notify', svc, name, {
          ...(content.body ? { 'notification.body': content.body } : {}),
          'notification.app': row.identifier,
        }, { timestampMs: tsMs });
        if (ok) console.log(`  ${svc} / ${(content.title ?? '').slice(0, 60)}`);
      }

      if (seenIds.size > 500) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-250)) seenIds.add(id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('authorization denied') || msg.includes('not permitted')) {
        console.error(`${tag('notif')} Full Disk Access required — System Settings → Privacy & Security → Full Disk Access`);
        return;
      }
      console.warn(`${tag('notif')} error:`, msg.slice(0, 120));
    }
  }

  console.log(`${tag('notif')} polling every ${POLL_S}s`);
  poll();
  setInterval(poll, POLL_S * 1000);
}

// ---------------------------------------------------------------------------
// Module: Datadog
// ---------------------------------------------------------------------------

function startDdPoller() {
  const DD_API_KEY = process.env.DD_API_KEY!;
  const DD_APP_KEY = (process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY)!;
  const DD_SITE = process.env.DD_SITE ?? 'datadoghq.com';
  const DD_QUERY = process.env.DD_QUERY ?? '*';
  const POLL_S = Number(process.env.POLL_INTERVAL_S) || 5;
  const LOOKBACK_MS = 60_000;

  const seenIds = new Set<string>();

  async function poll() {
    try {
      const now = new Date().toISOString();
      const from = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const resp = await fetch(`https://api.${DD_SITE}/api/v2/spans/events/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': DD_API_KEY,
          'DD-APPLICATION-KEY': DD_APP_KEY,
        },
        body: JSON.stringify({
          data: { attributes: { filter: { query: DD_QUERY, from, to: now }, page: { limit: 50 }, sort: 'timestamp' }, type: 'search_request' },
        }),
      });

      if (resp.status === 429) { console.warn(`${tag('dd')} rate limited`); return; }
      if (!resp.ok) { console.warn(`${tag('dd')} API error: ${resp.status}`); return; }

      const json = await resp.json();
      const spans = json?.data ?? [];
      let count = 0;

      for (const span of spans) {
        const id = String(span?.id ?? '');
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const attrs = span?.attributes as Record<string, unknown> | undefined;
        if (!attrs) continue;
        const service = String(attrs.service ?? 'unknown');
        const name = String(attrs.resource_name ?? attrs.operation_name ?? 'unknown');
        const status = String(attrs.status ?? 'ok');

        const ok = await postSpan('datadog', service, name, {}, { statusCode: status === 'error' ? 2 : 1 });
        if (ok) {
          console.log(`  ${service} / ${name.slice(0, 50)} (${status === 'error' ? 'ERR' : 'OK'})`);
          count++;
        }
      }

      if (count) console.log(`${tag('dd')} ${count} new spans`);
      else process.stdout.write('.');

      if (seenIds.size > 1000) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-500)) seenIds.add(id);
      }
    } catch (err) {
      console.warn(`${tag('dd')} poll error:`, err);
    }
  }

  console.log(`${tag('dd')} polling ${DD_SITE} every ${POLL_S}s`);
  poll();
  setInterval(poll, POLL_S * 1000);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

console.log(`\n  streamscapes agent`);
console.log(`  ${useRemote ? '🌐 remote' : '🏠 local'} → ${SS_ENDPOINT}\n`);

const modules: Array<{ name: string; start: () => void; check?: () => boolean }> = [
  { name: 'notif', start: startNotifPoller },
  { name: 'dd', start: startDdPoller, check: () => !!(process.env.DD_API_KEY && (process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY)) },
];

let started = 0;
for (const mod of modules) {
  if (!moduleEnabled(mod.name, mod.check)) {
    if (mod.check && !mod.check()) {
      console.log(`  ○ ${mod.name} — skipped (missing env vars)`);
    } else if (requestedModules) {
      // Not requested, silently skip
    }
    continue;
  }
  mod.start();
  started++;
}

if (started === 0) {
  console.error('\nNo modules started. Check --modules flag and env vars.');
  process.exit(1);
}

console.log(`\n  ${started} module(s) running. Ctrl+C to stop.\n`);
