"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/store';

const DD_POLL_INTERVAL = 5; // must match POLL_INTERVAL_MS / 1000 in datadog-adapter

function useCountdown(lastPollTime: string | undefined, polling: boolean): number {
  const [remaining, setRemaining] = useState(DD_POLL_INTERVAL);
  const lastPollRef = useRef(lastPollTime);

  useEffect(() => {
    if (!polling || !lastPollTime) { setRemaining(DD_POLL_INTERVAL); return; }
    lastPollRef.current = lastPollTime;

    const tick = () => {
      const elapsed = (Date.now() - new Date(lastPollRef.current!).getTime()) / 1000;
      setRemaining(Math.max(0, Math.ceil(DD_POLL_INTERVAL - elapsed)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastPollTime, polling]);

  return remaining;
}

interface RecentSpan {
  serviceName: string;
  spanName: string;
  durationMs: number;
  isError: boolean;
  timestamp: number;
}

interface DdStatus {
  configured: boolean;
  polling: boolean;
  site?: string;
  query?: string;
  recentSpans?: RecentSpan[];
  lastPoll?: { time: string; status: number; spanCount: number } | null;
}

const DD_SITES = [
  'datadoghq.com',
  'datadoghq.eu',
  'us3.datadoghq.com',
  'us5.datadoghq.com',
  'ap1.datadoghq.com',
  'ddog-gov.com',
];

export default function ConnectionsPanel() {
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const [copied, setCopied] = useState<string | null>(null);

  // API key state
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [apiKeyFull, setApiKeyFull] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // GitHub webhook configs state
  const [ghConfigs, setGhConfigs] = useState<Array<{ id: string; name: string }>>([]);

  // Datadog form state
  const [ddApiKey, setDdApiKey] = useState('');
  const [ddAppKey, setDdAppKey] = useState('');
  const [ddSite, setDdSite] = useState('datadoghq.com');
  const [ddQuery, setDdQuery] = useState('');
  const [ddStatus, setDdStatus] = useState<DdStatus>({ configured: false, polling: false });
  const [ddEditing, setDdEditing] = useState(false);
  const [playedSpans, setPlayedSpans] = useState<Set<number>>(new Set());
  const [sseSpans, setSseSpans] = useState<RecentSpan[]>([]);

  // Load API key status + GitHub webhook configs on mount
  useEffect(() => {
    if (!isAuthed) return;
    fetch('/api/user/api-key')
      .then((r) => r.json())
      .then((data: { hasKey: boolean; prefix: string | null }) => {
        setApiKeyPrefix(data.prefix);
      })
      .catch(() => {});
    fetch('/api/user/configs')
      .then((r) => r.json())
      .then((configs: Array<{ id: string; type: string; name: string }>) => {
        setGhConfigs(configs.filter((c) => c.type === 'github'));
      })
      .catch(() => {});
  }, [isAuthed]);

  const generateApiKeyHandler = useCallback(async () => {
    setApiKeyLoading(true);
    try {
      const res = await fetch('/api/user/api-key', { method: 'POST' });
      const data = await res.json();
      setApiKeyFull(data.key);
      setApiKeyPrefix(data.prefix);
    } finally {
      setApiKeyLoading(false);
    }
  }, []);

  const revokeApiKey = useCallback(async () => {
    await fetch('/api/user/api-key', { method: 'DELETE' });
    setApiKeyPrefix(null);
    setApiKeyFull(null);
  }, []);

  // Load DD config on mount — from API if authenticated, localStorage if not
  useEffect(() => {
    if (isAuthed) {
      fetch('/api/user/configs')
        .then((r) => r.json())
        .then((configs: Array<{ type: string; credentials?: { apiKey?: string; appKey?: string; site?: string; query?: string } }>) => {
          const dd = configs.find((c) => c.type === 'datadog');
          if (dd?.credentials) {
            if (dd.credentials.apiKey) setDdApiKey(dd.credentials.apiKey);
            if (dd.credentials.appKey) setDdAppKey(dd.credentials.appKey);
            if (dd.credentials.site) setDdSite(dd.credentials.site);
            if (dd.credentials.query) setDdQuery(dd.credentials.query);
            // Also start polling if not already running
            if (dd.credentials.apiKey && dd.credentials.appKey) {
              fetch('/api/ingest/datadog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dd.credentials),
              });
            }
          }
        })
        .catch(() => {});
    } else {
      try {
        const raw = localStorage.getItem('ss-dd-config');
        if (raw) {
          const cfg = JSON.parse(atob(raw));
          if (cfg.apiKey) setDdApiKey(cfg.apiKey);
          if (cfg.appKey) setDdAppKey(cfg.appKey);
          if (cfg.site) setDdSite(cfg.site);
          if (cfg.query) setDdQuery(cfg.query);
        }
      } catch { /* ignore corrupt data */ }
    }
  }, [isAuthed]);

  const countdown = useCountdown(ddStatus.lastPoll?.time, ddStatus.polling);

  const otlpEndpoint = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ingest/otlp`
    : 'http://localhost:3000/api/ingest/otlp';

  // Listen to SSE stream for real-time span updates (only when authenticated)
  useEffect(() => {
    if (!isAuthed) return;
    const es = new EventSource('/api/ingest/stream');
    es.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          serviceName: string;
          spanName: string;
          durationMs: number;
          statusCode: number;
          timestamp: number;
          source?: string;
          replay?: boolean;
        };
        // Only show DD spans (not OTLP or replays)
        if (msg.source !== 'datadog') return;
        if (msg.replay) return;

        const span: RecentSpan = {
          serviceName: msg.serviceName,
          spanName: msg.spanName,
          durationMs: msg.durationMs,
          isError: msg.statusCode === 2,
          timestamp: msg.timestamp,
        };
        setSseSpans((prev) => {
          const next = [span, ...prev];
          if (next.length > 20) next.length = 20;
          return next;
        });
      } catch { /* skip malformed */ }
    });
    return () => es.close();
  }, [isAuthed]);

  // Poll DD config status + auto-reconnect (slow poll, just for config info)
  useEffect(() => {
    const poll = () => {
      fetch('/api/ingest/datadog')
        .then((r) => r.json())
        .then((s: DdStatus) => {
          setDdStatus(s);
          // Auto-reconnect if server lost config (cold start) or config set but not polling yet
          if (!s.configured || !s.polling) {
            if (isAuthed) {
              // Reconnect from DB-persisted config
              fetch('/api/user/configs')
                .then((r) => r.json())
                .then((configs: Array<{ type: string; credentials?: { apiKey?: string; appKey?: string; site?: string; query?: string } }>) => {
                  const dd = configs.find((c) => c.type === 'datadog');
                  if (dd?.credentials?.apiKey && dd?.credentials?.appKey) {
                    fetch('/api/ingest/datadog', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(dd.credentials),
                    }).then(() => poll());
                  }
                })
                .catch(() => {});
            } else {
              try {
                const raw = localStorage.getItem('ss-dd-config');
                if (raw) {
                  const cfg = JSON.parse(atob(raw));
                  if (cfg.apiKey && cfg.appKey) {
                    fetch('/api/ingest/datadog', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(cfg),
                    }).then(() => poll());
                  }
                }
              } catch { /* ignore */ }
            }
          }
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [isAuthed]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const replaySpan = useCallback(async (span: RecentSpan, index: number) => {
    const now = Date.now();
    // Ensure replayed spans have enough duration to be audible (min 50ms)
    const durationNs = Math.round(Math.max(span.durationMs, 50) * 1_000_000);
    const body = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: span.serviceName } }] },
        scopeSpans: [{
          spans: [{
            name: span.spanName,
            kind: 2,
            startTimeUnixNano: String(now * 1_000_000),
            endTimeUnixNano: String(now * 1_000_000 + durationNs),
            status: { code: span.isError ? 2 : 1 },
            attributes: [],
          }],
        }],
      }],
    };
    await fetch('/api/ingest/otlp/v1/traces?source=datadog&replay=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setPlayedSpans((prev) => new Set(prev).add(index));
  }, []);

  const configureDd = useCallback(async () => {
    // Always POST to the ingest adapter so polling starts immediately
    await fetch('/api/ingest/datadog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: ddApiKey, appKey: ddAppKey, site: ddSite, query: ddQuery }),
    });
    // Persist: API if authenticated, localStorage if not
    if (isAuthed) {
      fetch('/api/user/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'datadog',
          name: 'Datadog',
          credentials: { provider: 'datadog', apiKey: ddApiKey, appKey: ddAppKey, site: ddSite, query: ddQuery },
        }),
      }).catch(() => {});
    } else {
      try {
        localStorage.setItem('ss-dd-config', btoa(JSON.stringify({ apiKey: ddApiKey, appKey: ddAppKey, site: ddSite, query: ddQuery })));
      } catch { /* quota exceeded etc */ }
    }
    setDdStatus({ configured: true, polling: true, site: ddSite, query: ddQuery });
    setDdEditing(false);
  }, [ddApiKey, ddAppKey, ddSite, ddQuery, isAuthed]);

  const clearDd = useCallback(async () => {
    await fetch('/api/ingest/datadog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    if (isAuthed) {
      // Find and delete the DD config from the API
      fetch('/api/user/configs')
        .then((r) => r.json())
        .then((configs: Array<{ id: string; type: string }>) => {
          const dd = configs.find((c) => c.type === 'datadog');
          if (dd) fetch(`/api/user/configs?id=${dd.id}`, { method: 'DELETE' });
        })
        .catch(() => {});
    }
    localStorage.removeItem('ss-dd-config');
    setDdStatus({ configured: false, polling: false });
    setDdEditing(false);
  }, [isAuthed]);

  const inputStyle = {
    fontFamily: 'var(--font-display, var(--ff-display))',
    fontSize: 12,
    color: 'rgba(245, 240, 235, 0.7)',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    padding: '6px 10px',
    width: '100%',
    outline: 'none',
  } as const;

  const labelStyle = {
    fontFamily: 'var(--font-body, var(--ff-body))',
    fontSize: 11,
    fontWeight: 400 as const,
    color: 'rgba(245, 240, 235, 0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 4,
  };

  const smallBtnStyle = {
    fontFamily: 'var(--font-display, var(--ff-display))',
    fontSize: 11,
    fontWeight: 500 as const,
    color: 'rgba(245, 240, 235, 0.5)',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    padding: '5px 12px',
    cursor: 'pointer',
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <div className="flex flex-col gap-5">
      {/* API Key Section — only for authenticated users */}
      {isAuthed && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 10 }}>API Key</div>

          {apiKeyFull ? (
            <div>
              <div style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 11,
                color: 'rgba(239, 184, 56, 0.7)',
                marginBottom: 6,
              }}>
                Copy this key now — it won't be shown again
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <code style={{
                  fontFamily: 'var(--font-display, var(--ff-display))',
                  fontSize: 11,
                  color: 'rgba(245, 240, 235, 0.55)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  userSelect: 'all',
                }}>
                  {apiKeyFull}
                </code>
                <button onClick={() => copyToClipboard(apiKeyFull, 'apikey')} style={smallBtnStyle}>
                  {copied === 'apikey' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button onClick={() => setApiKeyFull(null)} style={{ ...smallBtnStyle, color: 'rgba(245, 240, 235, 0.3)' }}>
                Dismiss
              </button>
            </div>
          ) : apiKeyPrefix ? (
            <div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'rgba(245, 240, 235, 0.4)',
                marginBottom: 8,
              }}>
                {apiKeyPrefix}...
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={generateApiKeyHandler} disabled={apiKeyLoading} style={smallBtnStyle}>
                  {apiKeyLoading ? 'Generating...' : 'Regenerate'}
                </button>
                <button onClick={revokeApiKey} style={{ ...smallBtnStyle, color: 'rgba(239, 68, 68, 0.7)' }}>
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 11,
                color: 'rgba(245, 240, 235, 0.3)',
                marginBottom: 8,
              }}>
                Generate an API key for OTLP, webhooks, and notify endpoints
              </div>
              <button onClick={generateApiKeyHandler} disabled={apiKeyLoading} style={smallBtnStyle}>
                {apiKeyLoading ? 'Generating...' : 'Generate API Key'}
              </button>
            </div>
          )}
        </div>
      )}

      {isAuthed && <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />}

      {/* OTLP Section */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 10 }}>OTLP Ingest</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <code
            style={{
              fontFamily: 'var(--font-display, var(--ff-display))',
              fontSize: 12,
              color: 'rgba(245, 240, 235, 0.55)',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 6,
              padding: '6px 10px',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {otlpEndpoint}
          </code>
          <button
            onClick={() => copyToClipboard(otlpEndpoint, 'url')}
            style={smallBtnStyle}
          >
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Config snippets */}
        <details style={{ marginBottom: 10 }}>
          <summary
            style={{
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 11,
              color: 'rgba(245, 240, 235, 0.25)',
              cursor: 'pointer',
              marginBottom: 6,
            }}
          >
            Setup snippets
          </summary>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(245, 240, 235, 0.4)',
              fontFamily: 'monospace',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 6,
              padding: 10,
              whiteSpace: 'pre',
              lineHeight: 1.5,
            }}
          >
{`# SDK env var
OTEL_EXPORTER_OTLP_ENDPOINT=${otlpEndpoint}
OTEL_EXPORTER_OTLP_PROTOCOL=http/json

# Collector config
exporters:
  otlphttp/streamscapes:
    endpoint: ${otlpEndpoint}
    encoding: json`}
          </div>
        </details>

      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />

      {/* Datadog Section */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 10 }}>Datadog</div>

        {ddStatus.configured && (
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 12,
                color: ddStatus.polling ? 'rgba(74, 222, 128, 0.7)' : 'rgba(245, 240, 235, 0.4)',
                marginBottom: 4,
              }}
            >
              {ddStatus.polling ? `Next poll in ${countdown}s` : 'Configured (not polling)'}
              {ddStatus.site && ` \u00B7 ${ddStatus.site}`}
            </div>
            {ddStatus.query && (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(245, 240, 235, 0.3)', marginBottom: 6 }}>
                {ddStatus.query}
              </div>
            )}
            {ddStatus.lastPoll && (
              <div style={{ fontFamily: 'var(--font-body, var(--ff-body))', fontSize: 10, color: 'rgba(245, 240, 235, 0.2)', marginBottom: 8 }}>
                Last poll: {new Date(ddStatus.lastPoll.time).toLocaleTimeString()} — {ddStatus.lastPoll.status === 200 ? `${ddStatus.lastPoll.spanCount} spans` : `HTTP ${ddStatus.lastPoll.status}`}
              </div>
            )}

            {/* Recent spans — fed directly from SSE stream */}
            {sseSpans.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Recent <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(click to replay)</span></div>
                {sseSpans.map((span, i) => (
                  <div
                    key={i}
                    onClick={() => replaySpan(span, i)}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: span.isError ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 240, 235, 0.35)',
                      padding: '3px 4px',
                      display: 'flex',
                      gap: 8,
                      cursor: 'pointer',
                      borderRadius: 4,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ color: 'rgba(245, 240, 235, 0.25)', width: 14, flexShrink: 0, textAlign: 'center', fontSize: 6 }}>
                      {'\u25CF'}
                    </span>
                    <span style={{ color: 'rgba(245, 240, 235, 0.15)', width: 58, flexShrink: 0 }}>
                      {new Date(span.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{ width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {span.serviceName}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {span.spanName}
                    </span>
                    <span style={{ flexShrink: 0 }}>
                      {span.durationMs.toFixed(0)}ms
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDdEditing(true)} style={smallBtnStyle}>
                Edit
              </button>
              <button onClick={clearDd} style={{ ...smallBtnStyle, color: 'rgba(239, 68, 68, 0.7)' }}>
                Disconnect
              </button>
            </div>
          </div>
        )}

        {(!ddStatus.configured || ddEditing) && (
          <div className="flex flex-col gap-2.5" style={{ marginTop: ddStatus.configured ? 10 : 0 }}>
            <div>
              <div style={labelStyle}>DD API Key</div>
              <input
                type="password"
                value={ddApiKey}
                onChange={(e) => setDdApiKey(e.target.value)}
                placeholder="DD API Key"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Application Key</div>
              <input
                type="password"
                value={ddAppKey}
                onChange={(e) => setDdAppKey(e.target.value)}
                placeholder="DD Application Key"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Site</div>
              <select
                value={ddSite}
                onChange={(e) => setDdSite(e.target.value)}
                style={{ ...inputStyle, appearance: 'auto' as never }}
              >
                {DD_SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Query filter (optional)</div>
              <input
                type="text"
                value={ddQuery}
                onChange={(e) => setDdQuery(e.target.value)}
                placeholder="e.g. service:synapse"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={configureDd}
                disabled={!ddApiKey || !ddAppKey}
                style={{
                  ...smallBtnStyle,
                  opacity: (!ddApiKey || !ddAppKey) ? 0.3 : 1,
                }}
              >
                {ddStatus.configured ? 'Reconnect' : 'Connect'}
              </button>
              {ddEditing && (
                <button onClick={() => setDdEditing(false)} style={{ ...smallBtnStyle, color: 'rgba(245, 240, 235, 0.3)' }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GitHub Webhook URLs — show per-config URLs for authenticated users */}
      {isAuthed && ghConfigs.length > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />
          <div>
            <div style={{ ...labelStyle, marginBottom: 10 }}>GitHub Webhooks</div>
            {ghConfigs.map((cfg) => {
              const webhookUrl = `${baseUrl}/api/ingest/webhooks/github/${cfg.id}`;
              return (
                <div key={cfg.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-body, var(--ff-body))', fontSize: 11, color: 'rgba(245, 240, 235, 0.4)', marginBottom: 4 }}>
                    {cfg.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{
                      fontFamily: 'var(--font-display, var(--ff-display))',
                      fontSize: 10,
                      color: 'rgba(245, 240, 235, 0.4)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {webhookUrl}
                    </code>
                    <button onClick={() => copyToClipboard(webhookUrl, `gh-${cfg.id}`)} style={smallBtnStyle}>
                      {copied === `gh-${cfg.id}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
