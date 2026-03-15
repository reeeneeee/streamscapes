/**
 * Streamscapes Agent — notification + Datadog pollers with a start/stop API.
 *
 * Ported from scripts/agent.ts for use in the Electron main process.
 */

import { execSync } from 'child_process';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  endpoint: string;
  apiKey: string;
  enableNotif: boolean;
  enableDd: boolean;
  ddApiKey?: string;
  ddAppKey?: string;
  ddSite?: string;
}

export interface AgentCallbacks {
  onLog: (module: string, message: string) => void;
  onSpanSent: (module: string, serviceName: string) => void;
  onError: (module: string, error: string) => void;
  onFdaRequired: () => void;
}

export interface AgentStatus {
  state: 'idle' | 'running' | 'error';
  spanCount?: number;
  error?: string;
  fdaRequired?: boolean;
}

// ---------------------------------------------------------------------------
// OTLP span helper
// ---------------------------------------------------------------------------

async function postSpan(
  config: AgentConfig,
  source: string,
  serviceName: string,
  spanName: string,
  fields: Record<string, string | number>,
  extra?: { timestampMs?: number; statusCode?: number }
): Promise<{ ok: boolean; status?: number }> {
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
    const res = await fetch(`${config.endpoint}?source=${source}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Notification poller
// ---------------------------------------------------------------------------

function createNotifPoller(
  config: AgentConfig,
  callbacks: AgentCallbacks,
  shared: { consecutive401s: number; onAuthError: () => void }
) {
  const DB_PATH = join(homedir(), 'Library/Group Containers/group.com.apple.usernoted/db2/db');
  const MAC_EPOCH_OFFSET = 978307200;
  const POLL_S = 3;
  const PLIST_PATH = join(tmpdir(), `ss_notif_${process.pid}.plist`);

  const seenIds = new Set<number>();
  let lastDate = Date.now() / 1000 - MAC_EPOCH_OFFSET;
  let timer: ReturnType<typeof setInterval> | null = null;

  function appName(bundleId: string): string {
    const parts = String(bundleId).split('.');
    return parts[parts.length - 1] || bundleId;
  }

  function getContent(recId: number): { title?: string; body?: string } {
    try {
      execSync(
        `sqlite3 "${DB_PATH}" "SELECT writefile('${PLIST_PATH}', data) FROM record WHERE rec_id = ${recId};"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      const raw = execSync(`plutil -p "${PLIST_PATH}"`, { encoding: 'utf-8', timeout: 5000 });
      const extract = (key: string) => raw.match(new RegExp(`"${key}"\\s*=>\\s*"([^"]*)"`, 'm'))?.[1];
      return { title: extract('titl'), body: extract('body') };
    } catch { return {}; }
  }

  async function poll() {
    try {
      const query = `SELECT r.rec_id, a.identifier, r.delivered_date FROM record r JOIN app a ON r.app_id = a.app_id WHERE r.delivered_date > ${lastDate} ORDER BY r.delivered_date ASC LIMIT 50;`;
      const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (!result) return;

      const rows = JSON.parse(result) as Array<{ rec_id: number; identifier: string; delivered_date: number }>;
      const newRows = rows.filter(r => !seenIds.has(r.rec_id));
      if (!newRows.length) return;

      callbacks.onLog('notif', `${newRows.length} new`);
      for (const row of newRows) {
        seenIds.add(row.rec_id);
        lastDate = Math.max(lastDate, row.delivered_date);
        const svc = appName(row.identifier);
        const content = getContent(row.rec_id);
        const name = content.title ? `${svc}: ${content.title}` : svc;
        const tsMs = (row.delivered_date + MAC_EPOCH_OFFSET) * 1000;
        const result = await postSpan(config, 'notify', svc, name, {
          ...(content.body ? { 'notification.body': content.body } : {}),
          'notification.app': row.identifier,
        }, { timestampMs: tsMs });

        if (result.ok) {
          shared.consecutive401s = 0;
          callbacks.onSpanSent('notif', svc);
        } else if (result.status === 401) {
          shared.consecutive401s++;
          if (shared.consecutive401s >= 3) {
            shared.onAuthError();
            return;
          }
        }
      }

      // Prune seen set
      if (seenIds.size > 500) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-250)) seenIds.add(id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('authorization denied') || msg.includes('not permitted') || msg.includes('unable to open')) {
        callbacks.onFdaRequired();
        return;
      }
      callbacks.onLog('notif', `error: ${msg.slice(0, 120)}`);
    }
  }

  return {
    start() {
      callbacks.onLog('notif', `polling every ${POLL_S}s`);
      poll();
      timer = setInterval(poll, POLL_S * 1000);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
    resetAfterWake() {
      // Reset cursor to now - 30s to avoid flood but catch recent notifications
      lastDate = Date.now() / 1000 - MAC_EPOCH_OFFSET - 30;
    },
  };
}

// ---------------------------------------------------------------------------
// Datadog poller
// ---------------------------------------------------------------------------

function createDdPoller(
  config: AgentConfig,
  callbacks: AgentCallbacks,
  shared: { consecutive401s: number; onAuthError: () => void }
) {
  const DD_API_KEY = config.ddApiKey!;
  const DD_APP_KEY = config.ddAppKey!;
  const DD_SITE = config.ddSite ?? 'datadoghq.com';
  const DD_QUERY = '*';
  const POLL_S = 5;
  const LOOKBACK_MS = 60_000;

  const seenIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;

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

      if (resp.status === 429) { callbacks.onLog('dd', 'rate limited'); return; }
      if (!resp.ok) { callbacks.onLog('dd', `API error: ${resp.status}`); return; }

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

        const result = await postSpan(config, 'datadog', service, name, {}, { statusCode: status === 'error' ? 2 : 1 });
        if (result.ok) {
          shared.consecutive401s = 0;
          callbacks.onSpanSent('dd', service);
          count++;
        } else if (result.status === 401) {
          shared.consecutive401s++;
          if (shared.consecutive401s >= 3) {
            shared.onAuthError();
            return;
          }
        }
      }

      if (count) callbacks.onLog('dd', `${count} new spans`);

      // Prune seen set
      if (seenIds.size > 1000) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-500)) seenIds.add(id);
      }
    } catch (err) {
      callbacks.onLog('dd', `poll error: ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    start() {
      callbacks.onLog('dd', `polling ${DD_SITE} every ${POLL_S}s`);
      poll();
      timer = setInterval(poll, POLL_S * 1000);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createAgent(config: AgentConfig, callbacks: AgentCallbacks) {
  let running = false;
  let notifPoller: ReturnType<typeof createNotifPoller> | null = null;
  let ddPoller: ReturnType<typeof createDdPoller> | null = null;

  const shared = {
    consecutive401s: 0,
    onAuthError() {
      stop();
      callbacks.onError('auth', 'API key invalid or revoked — check Connections in Streamscapes');
    },
  };

  function start() {
    if (running) return;
    running = true;

    if (config.enableNotif) {
      notifPoller = createNotifPoller(config, callbacks, shared);
      notifPoller.start();
    }

    if (config.enableDd && config.ddApiKey && config.ddAppKey) {
      ddPoller = createDdPoller(config, callbacks, shared);
      ddPoller.start();
    }
  }

  function stop() {
    notifPoller?.stop();
    ddPoller?.stop();
    notifPoller = null;
    ddPoller = null;
    running = false;
  }

  function isRunning() {
    return running;
  }

  function resetAfterWake() {
    notifPoller?.resetAfterWake();
  }

  return { start, stop, isRunning, resetAfterWake };
}
