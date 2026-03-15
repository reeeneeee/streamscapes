#!/usr/bin/env node
"use strict";

// scripts/agent.ts
var import_child_process = require("child_process");
var import_os = require("os");
var import_path = require("path");
var useRemote = process.argv.includes("--remote") || process.argv.includes("-r");
var SS_API_KEY = useRemote ? process.env.SS_PROD_API_KEY ?? process.env.SS_API_KEY : process.env.SS_LOCAL_API_KEY ?? process.env.SS_API_KEY;
var SS_PROD_ENDPOINT = process.env.SS_PROD_ENDPOINT ?? "https://www.streamscapes.fm/api/ingest/otlp/v1/traces";
var SS_ENDPOINT = process.env.SS_ENDPOINT ?? (useRemote ? SS_PROD_ENDPOINT : "http://localhost:3000/api/ingest/otlp/v1/traces");
if (!SS_API_KEY) {
  console.error("Missing SS_API_KEY \u2014 generate one in the Streamscapes Connections panel");
  process.exit(1);
}
var modulesArg = process.argv.find((a) => a.startsWith("--modules="))?.slice(10) ?? process.argv[process.argv.indexOf("--modules") + 1];
var requestedModules = modulesArg ? new Set(modulesArg.split(",").map((m) => m.trim())) : null;
function moduleEnabled(name, requiresEnv) {
  if (requestedModules && !requestedModules.has(name)) return false;
  if (requiresEnv && !requiresEnv()) return false;
  return true;
}
async function postSpan(source, serviceName, spanName, fields, extra) {
  const ts = extra?.timestampMs ?? Date.now();
  const startNano = String(ts * 1e6);
  const endNano = String((ts + 1) * 1e6);
  const body = {
    resourceSpans: [{
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: serviceName } }]
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
            value: typeof val === "number" ? { intValue: Math.round(val) } : { stringValue: String(val) }
          }))
        }]
      }]
    }]
  };
  try {
    const res = await fetch(`${SS_ENDPOINT}?source=${source}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SS_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch {
    return false;
  }
}
var tag = (mod) => `[${mod}]`;
function startNotifPoller() {
  const DB_PATH = (0, import_path.join)((0, import_os.homedir)(), "Library/Group Containers/group.com.apple.usernoted/db2/db");
  const MAC_EPOCH_OFFSET = 978307200;
  const POLL_S = Number(process.env.NOTIF_POLL_INTERVAL_S) || 3;
  const seenIds = /* @__PURE__ */ new Set();
  let lastDate = Date.now() / 1e3 - MAC_EPOCH_OFFSET;
  function appName(bundleId) {
    const parts = String(bundleId).split(".");
    return parts[parts.length - 1] || bundleId;
  }
  function getContent(recId) {
    try {
      (0, import_child_process.execSync)(
        `sqlite3 "${DB_PATH}" "SELECT writefile('/tmp/ss_notif.plist', data) FROM record WHERE rec_id = ${recId};"`,
        { encoding: "utf-8", timeout: 5e3 }
      );
      const raw = (0, import_child_process.execSync)("plutil -p /tmp/ss_notif.plist", { encoding: "utf-8", timeout: 5e3 });
      const extract = (key) => raw.match(new RegExp(`"${key}"\\s*=>\\s*"([^"]*)"`, "m"))?.[1];
      return { title: extract("titl"), body: extract("body") };
    } catch {
      return {};
    }
  }
  async function poll() {
    try {
      const query = `SELECT r.rec_id, a.identifier, r.delivered_date FROM record r JOIN app a ON r.app_id = a.app_id WHERE r.delivered_date > ${lastDate} ORDER BY r.delivered_date ASC LIMIT 50;`;
      const result = (0, import_child_process.execSync)(`sqlite3 -json "${DB_PATH}" "${query}"`, { encoding: "utf-8", timeout: 5e3 }).trim();
      if (!result) {
        process.stdout.write(".");
        return;
      }
      const rows = JSON.parse(result);
      const newRows = rows.filter((r) => !seenIds.has(r.rec_id));
      if (!newRows.length) {
        process.stdout.write(".");
        return;
      }
      console.log(`
${tag("notif")} ${newRows.length} new`);
      for (const row of newRows) {
        seenIds.add(row.rec_id);
        lastDate = Math.max(lastDate, row.delivered_date);
        const svc = appName(row.identifier);
        const content = getContent(row.rec_id);
        const name = content.title ? `${svc}: ${content.title}` : svc;
        const tsMs = (row.delivered_date + MAC_EPOCH_OFFSET) * 1e3;
        const ok = await postSpan("notify", svc, name, {
          ...content.body ? { "notification.body": content.body } : {},
          "notification.app": row.identifier
        }, { timestampMs: tsMs });
        if (ok) console.log(`  ${svc} / ${(content.title ?? "").slice(0, 60)}`);
      }
      if (seenIds.size > 500) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-250)) seenIds.add(id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("authorization denied") || msg.includes("not permitted")) {
        console.error(`${tag("notif")} Full Disk Access required \u2014 System Settings \u2192 Privacy & Security \u2192 Full Disk Access`);
        return;
      }
      console.warn(`${tag("notif")} error:`, msg.slice(0, 120));
    }
  }
  console.log(`${tag("notif")} polling every ${POLL_S}s`);
  poll();
  setInterval(poll, POLL_S * 1e3);
}
function startDdPoller() {
  const DD_API_KEY = process.env.DD_API_KEY;
  const DD_APP_KEY = process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY;
  const DD_SITE = process.env.DD_SITE ?? "datadoghq.com";
  const DD_QUERY = process.env.DD_QUERY ?? "*";
  const POLL_S = Number(process.env.POLL_INTERVAL_S) || 5;
  const LOOKBACK_MS = 6e4;
  const seenIds = /* @__PURE__ */ new Set();
  async function poll() {
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const from = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const resp = await fetch(`https://api.${DD_SITE}/api/v2/spans/events/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": DD_API_KEY,
          "DD-APPLICATION-KEY": DD_APP_KEY
        },
        body: JSON.stringify({
          data: { attributes: { filter: { query: DD_QUERY, from, to: now }, page: { limit: 50 }, sort: "timestamp" }, type: "search_request" }
        })
      });
      if (resp.status === 429) {
        console.warn(`${tag("dd")} rate limited`);
        return;
      }
      if (!resp.ok) {
        console.warn(`${tag("dd")} API error: ${resp.status}`);
        return;
      }
      const json = await resp.json();
      const spans = json?.data ?? [];
      let count = 0;
      for (const span of spans) {
        const id = String(span?.id ?? "");
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const attrs = span?.attributes;
        if (!attrs) continue;
        const service = String(attrs.service ?? "unknown");
        const name = String(attrs.resource_name ?? attrs.operation_name ?? "unknown");
        const status = String(attrs.status ?? "ok");
        const ok = await postSpan("datadog", service, name, {}, { statusCode: status === "error" ? 2 : 1 });
        if (ok) {
          console.log(`  ${service} / ${name.slice(0, 50)} (${status === "error" ? "ERR" : "OK"})`);
          count++;
        }
      }
      if (count) console.log(`${tag("dd")} ${count} new spans`);
      else process.stdout.write(".");
      if (seenIds.size > 1e3) {
        const arr = [...seenIds];
        seenIds.clear();
        for (const id of arr.slice(-500)) seenIds.add(id);
      }
    } catch (err) {
      console.warn(`${tag("dd")} poll error:`, err);
    }
  }
  console.log(`${tag("dd")} polling ${DD_SITE} every ${POLL_S}s`);
  poll();
  setInterval(poll, POLL_S * 1e3);
}
console.log(`
  streamscapes agent`);
console.log(`  ${useRemote ? "\u{1F310} remote" : "\u{1F3E0} local"} \u2192 ${SS_ENDPOINT}
`);
var modules = [
  { name: "notif", start: startNotifPoller },
  { name: "dd", start: startDdPoller, check: () => !!(process.env.DD_API_KEY && (process.env.DD_APPLICATION_KEY ?? process.env.DD_APP_KEY)) }
];
var started = 0;
for (const mod of modules) {
  if (!moduleEnabled(mod.name, mod.check)) {
    if (mod.check && !mod.check()) {
      console.log(`  \u25CB ${mod.name} \u2014 skipped (missing env vars)`);
    } else if (requestedModules) {
    }
    continue;
  }
  mod.start();
  started++;
}
if (started === 0) {
  console.error("\nNo modules started. Check --modules flag and env vars.");
  process.exit(1);
}
console.log(`
  ${started} module(s) running. Ctrl+C to stop.
`);
