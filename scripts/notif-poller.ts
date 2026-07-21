#!/usr/bin/env npx tsx
/**
 * macOS Notification → Streamscapes forwarder.
 *
 * Polls the macOS notification center database and forwards new
 * notifications to the Streamscapes ingest endpoint as spans.
 *
 * Requires macOS. Your terminal needs Full Disk Access:
 *   System Settings → Privacy & Security → Full Disk Access → add Terminal/iTerm
 *
 * Usage:
 *   npx tsx --env-file .env scripts/notif-poller.ts          # local
 *   npx tsx --env-file .env scripts/notif-poller.ts --remote  # live
 */

import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const useRemote = process.argv.includes('--remote') || process.argv.includes('-r');
const SS_API_KEY = useRemote ? (process.env.SS_PROD_API_KEY ?? process.env.SS_API_KEY) : (process.env.SS_LOCAL_API_KEY ?? process.env.SS_API_KEY);
const SS_PROD_ENDPOINT = process.env.SS_PROD_ENDPOINT ?? 'https://www.streamscapes.fm/api/ingest/otlp/v1/traces';
const SS_ENDPOINT = process.env.SS_ENDPOINT ?? (useRemote ? SS_PROD_ENDPOINT : 'http://localhost:3000/api/ingest/otlp/v1/traces');
const POLL_INTERVAL_S = Number(process.env.NOTIF_POLL_INTERVAL_S) || 3;

if (!SS_API_KEY) {
  console.error('Missing SS_API_KEY — generate one in the Streamscapes Connections panel');
  process.exit(1);
}

const DB_PATH = join(homedir(), 'Library/Group Containers/group.com.apple.usernoted/db2/db');
/** Seconds between Unix epoch (1970) and Mac/Core Data epoch (2001-01-01) */
const MAC_EPOCH_OFFSET = 978307200;

const seenIds = new Set<number>();
// Start from "now" in Mac epoch seconds
let lastDeliveredDate = Date.now() / 1000 - MAC_EPOCH_OFFSET;

interface NotifRow {
  rec_id: number;
  identifier: string;
  delivered_date: number;
}

function queryNewNotifications(): NotifRow[] {
  try {
    const query = `SELECT r.rec_id, a.identifier, r.delivered_date FROM record r JOIN app a ON r.app_id = a.app_id WHERE r.delivered_date > ${lastDeliveredDate} ORDER BY r.delivered_date ASC LIMIT 50;`;
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (!result) return [];
    return JSON.parse(result) as NotifRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('authorization denied') || msg.includes('not permitted') || msg.includes('unable to open')) {
      console.error('[notif] Cannot read notification database.');
      console.error('        Grant Full Disk Access: System Settings → Privacy & Security → Full Disk Access → add your terminal');
      process.exit(1);
    }
    console.warn('[notif] Query error:', msg.slice(0, 200));
    return [];
  }
}

/** Extract notification title/body from the binary plist blob */
function getNotifContent(recId: number): { title?: string; body?: string; subtitle?: string } {
  try {
    // Write blob to temp file, then use `plutil -p` (handles types JSON can't)
    execSync(
      `sqlite3 "${DB_PATH}" "SELECT writefile('/tmp/ss_notif.plist', data) FROM record WHERE rec_id = ${recId};"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const raw = execSync('plutil -p /tmp/ss_notif.plist', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    // Parse plutil -p output: "key" => "value" format
    const extract = (key: string): string | undefined => {
      const re = new RegExp(`"${key}"\\s*=>\\s*"([^"]*)"`, 'm');
      const m = raw.match(re);
      return m?.[1] || undefined;
    };

    return {
      title: extract('titl'),
      subtitle: extract('subt'),
      body: extract('body'),
    };
  } catch {
    return {};
  }
}

/** Turn a bundle ID like "com.apple.MobileSMS" into "MobileSMS" */
function appName(bundleId: unknown): string {
  const str = String(bundleId ?? 'unknown');
  const parts = str.split('.');
  return parts[parts.length - 1] || str;
}

async function sendSpan(notif: NotifRow, content: { title?: string; body?: string; subtitle?: string }) {
  const service = appName(notif.identifier);
  const name = content.title ? `${service}: ${content.title}` : service;
  const timestampMs = (notif.delivered_date + MAC_EPOCH_OFFSET) * 1000;
  const timestampNs = String(timestampMs * 1_000_000);

  const attributes: Array<{ key: string; value: { stringValue: string } }> = [
    { key: 'service.name', value: { stringValue: service } },
  ];
  if (content.body) {
    attributes.push({ key: 'notification.body', value: { stringValue: content.body } });
  }
  if (content.subtitle) {
    attributes.push({ key: 'notification.subtitle', value: { stringValue: content.subtitle } });
  }
  attributes.push({ key: 'notification.app', value: { stringValue: notif.identifier } });

  const body = {
    resourceSpans: [{
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: service } }],
      },
      scopeSpans: [{
        spans: [{
          name,
          kind: 0, // INTERNAL
          startTimeUnixNano: timestampNs,
          endTimeUnixNano: String(timestampMs * 1_000_000 + 1_000_000), // +1ms
          status: { code: 1 }, // OK
          attributes,
        }],
      }],
    }],
  };

  try {
    const res = await fetch(`${SS_ENDPOINT}?source=notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const summary = [name, content.subtitle, content.body].filter(Boolean).join(' — ').slice(0, 80);
      console.log(`  ${service} / ${summary}`);
    } else {
      console.warn(`  [notif] POST failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`  [notif] POST error:`, err);
  }
}

async function poll() {
  const rows = queryNewNotifications();

  const newRows = rows.filter(r => !seenIds.has(r.rec_id));
  if (newRows.length === 0) {
    process.stdout.write('.');
    return;
  }

  console.log(`\n[notif] ${newRows.length} new notification(s)`);

  for (const row of newRows) {
    seenIds.add(row.rec_id);
    lastDeliveredDate = Math.max(lastDeliveredDate, row.delivered_date);
    const content = getNotifContent(row.rec_id);
    await sendSpan(row, content);
  }

  // Prune seen set
  if (seenIds.size > 500) {
    const arr = [...seenIds];
    seenIds.clear();
    for (const id of arr.slice(-250)) seenIds.add(id);
  }
}

// Main loop
console.log(`[notif] Polling macOS notifications every ${POLL_INTERVAL_S}s → ${SS_ENDPOINT}`);
console.log(`[notif] DB: ${DB_PATH}`);
poll();
setInterval(poll, POLL_INTERVAL_S * 1000);
