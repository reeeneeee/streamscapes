"use client";

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';

export default function ConnectionsPanel() {
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const [copied, setCopied] = useState<string | null>(null);

  // API key state
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [apiKeyFull, setApiKeyFull] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Anonymous API key state
  const [anonApiKey, setAnonApiKey] = useState<string | null>(null);
  const [anonKeyError, setAnonKeyError] = useState<string | null>(null);

  // GitHub webhook configs state
  const [ghConfigs, setGhConfigs] = useState<Array<{ id: string; name: string }>>([]);

  // Load API key status + GitHub webhook configs on mount
  useEffect(() => {
    // Restore anonymous key from localStorage
    const storedKey = localStorage.getItem('ss-anon-api-key');
    if (storedKey) setAnonApiKey(storedKey);

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

  const generateAnonKey = useCallback(async () => {
    setApiKeyLoading(true);
    setAnonKeyError(null);
    try {
      const headers: Record<string, string> = {};
      const existingKey = localStorage.getItem('ss-anon-api-key');
      if (existingKey) headers['X-Old-Api-Key'] = existingKey;
      const res = await fetch('/api/auth/anonymous-key', { method: 'POST', headers });
      if (!res.ok) {
        let msg = 'Failed to generate key';
        try { const data = await res.json(); msg = data.error ?? msg; } catch {}
        setAnonKeyError(msg);
        return;
      }
      const data = await res.json();
      localStorage.setItem('ss-anon-api-key', data.key);
      window.dispatchEvent(new Event('ss-anon-key-changed'));
      setAnonApiKey(data.key);
      setApiKeyFull(data.key);
      setApiKeyPrefix(data.prefix);
    } finally {
      setApiKeyLoading(false);
    }
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  const otlpEndpoint = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ingest/otlp`
    : 'http://localhost:3000/api/ingest/otlp';

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const ddEndpoint = `${baseUrl}/api/ingest/otlp/v1/traces`;

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

  const descStyle = {
    fontFamily: 'var(--font-body, var(--ff-body))',
    fontSize: 11,
    color: 'rgba(245, 240, 235, 0.3)',
    lineHeight: 1.6,
  };

  const detailsSummaryStyle: CSSProperties = {
    fontFamily: 'var(--font-body, var(--ff-body))',
    fontSize: 11,
    color: 'rgba(245, 240, 235, 0.25)',
    cursor: 'pointer',
    marginBottom: 6,
  };

  const codeBlockStyle = {
    fontSize: 11,
    color: 'rgba(245, 240, 235, 0.4)',
    fontFamily: 'monospace',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    padding: 10,
    whiteSpace: 'pre' as const,
    lineHeight: 1.5,
  };

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
                Generate an API key for the Chrome extension, OTLP, and webhooks
              </div>
              <button onClick={generateApiKeyHandler} disabled={apiKeyLoading} style={smallBtnStyle}>
                {apiKeyLoading ? 'Generating...' : 'Generate API Key'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Anonymous API Key Section — for non-authenticated users */}
      {!isAuthed && (
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
            </div>
          ) : anonApiKey ? (
            <div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'rgba(245, 240, 235, 0.4)',
                marginBottom: 8,
              }}>
                {anonApiKey.slice(0, 8)}...
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button onClick={generateAnonKey} disabled={apiKeyLoading} style={smallBtnStyle}>
                  {apiKeyLoading ? 'Generating...' : 'Regenerate'}
                </button>
                <button onClick={() => {
                  localStorage.removeItem('ss-anon-api-key');
                  setAnonApiKey(null);
                  setApiKeyFull(null);
                  setApiKeyPrefix(null);
                }} style={{ ...smallBtnStyle, color: 'rgba(239, 68, 68, 0.7)' }}>
                  Revoke
                </button>
              </div>
              <div style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 11,
                color: 'rgba(245, 240, 235, 0.25)',
              }}>
                Anonymous key active. Sign in to manage keys and presets.
              </div>
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 11,
                color: 'rgba(245, 240, 235, 0.3)',
                marginBottom: 8,
                lineHeight: 1.6,
              }}>
                Get an API key to connect the Chrome extension or send OTLP data — no sign-in required.
              </div>
              {anonKeyError && (
                <div style={{
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 11,
                  color: 'rgba(239, 68, 68, 0.7)',
                  marginBottom: 6,
                }}>
                  {anonKeyError}
                </div>
              )}
              <button onClick={generateAnonKey} disabled={apiKeyLoading} style={smallBtnStyle}>
                {apiKeyLoading ? 'Generating...' : 'Get API Key'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />

      {/* Forward Notifications */}
      <div id="forward-notifications">
        <div style={{ ...labelStyle, marginBottom: 10 }}>Forward Notifications</div>

        {isMobile ? (
          <div style={{ ...descStyle, lineHeight: 1.7 }}>
            Extensions and agents are available on desktop — a Chrome extension for browser activity and a macOS menu bar app for system notifications.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...descStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <g stroke="rgba(245,240,235,0.4)" strokeWidth="12">
                    <line x1="80" y1="80" x2="340" y2="80"/>
                    <line x1="80" y1="140" x2="340" y2="140"/>
                    <line x1="80" y1="200" x2="340" y2="200"/>
                    <line x1="80" y1="260" x2="340" y2="260"/>
                    <line x1="80" y1="320" x2="340" y2="320"/>
                  </g>
                  <text x="110" y="310" fontFamily="sans-serif" fontSize="100" fontWeight="600" fill="rgba(245,240,235,0.5)">0</text>
                  <text x="140" y="235" fontFamily="sans-serif" fontSize="170" fontWeight="300" fill="rgba(245,240,235,0.5)">1</text>
                  <text x="230" y="250" fontFamily="sans-serif" fontSize="100" fontWeight="600" fill="rgba(245,240,235,0.5)">0</text>
                  <text x="260" y="155" fontFamily="sans-serif" fontSize="170" fontWeight="300" fill="rgba(245,240,235,0.5)">1</text>
                </svg>
                <span>
                  <strong style={{ color: 'rgba(245, 240, 235, 0.45)' }}>Browser activity</strong>{' '}
                  — tab switches, downloads. Each domain becomes its own channel.
                </span>
              </div>
              <a
                href="https://chromewebstore.google.com/detail/streamscapes/baclddjikmealeefhbkincfpaifnajmm"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  ...smallBtnStyle,
                  color: 'rgba(245, 240, 235, 0.6)',
                  textDecoration: 'none',
                }}
              >
                Add to Chrome
              </a>
              <div style={{ ...descStyle, marginTop: 8, lineHeight: 1.7 }}>
                Install from the Chrome Web Store, then click the extension icon and paste your API key.
              </div>
            </div>

            <div>
              <div style={{ ...descStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <g stroke="rgba(245,240,235,0.4)" strokeWidth="12">
                    <line x1="80" y1="80" x2="340" y2="80"/>
                    <line x1="80" y1="140" x2="340" y2="140"/>
                    <line x1="80" y1="200" x2="340" y2="200"/>
                    <line x1="80" y1="260" x2="340" y2="260"/>
                    <line x1="80" y1="320" x2="340" y2="320"/>
                  </g>
                  <text x="110" y="310" fontFamily="sans-serif" fontSize="100" fontWeight="600" fill="rgba(245,240,235,0.5)">0</text>
                  <text x="140" y="235" fontFamily="sans-serif" fontSize="170" fontWeight="300" fill="rgba(245,240,235,0.5)">1</text>
                  <text x="230" y="250" fontFamily="sans-serif" fontSize="100" fontWeight="600" fill="rgba(245,240,235,0.5)">0</text>
                  <text x="260" y="155" fontFamily="sans-serif" fontSize="170" fontWeight="300" fill="rgba(245,240,235,0.5)">1</text>
                </svg>
                <span>
                  <strong style={{ color: 'rgba(245, 240, 235, 0.45)' }}>macOS menu bar agent</strong>{' '}
                  — streams system health (CPU, memory, disk, Docker), notifications, and Datadog traces into your soundscape.
                </span>
              </div>
              <a
                href="https://github.com/reeeneeee/streamscapes/releases/download/v0.1.0/Streamscapes.Agent.zip"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  ...smallBtnStyle,
                  color: 'rgba(245, 240, 235, 0.6)',
                  textDecoration: 'none',
                }}
              >
                Download Menu Bar App
              </a>
              <div style={{ ...descStyle, marginTop: 8, lineHeight: 1.7 }}>
                Unzip, move to Applications, then double-click to launch. The app lives in your menu bar — look for the icon up top.
              </div>
            </div>
          </>
        )}

        {/* iOS app */}
        <div style={{ marginTop: 14 }}>
          <div style={{ ...descStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <rect x="100" y="40" width="200" height="320" rx="30" stroke="rgba(245,240,235,0.4)" strokeWidth="12" fill="none"/>
              <line x1="160" y1="320" x2="240" y2="320" stroke="rgba(245,240,235,0.4)" strokeWidth="10" strokeLinecap="round"/>
            </svg>
            <span>
              <strong style={{ color: 'rgba(245, 240, 235, 0.45)' }}>iOS app</strong>{' '}
              — the full streamscapes experience on iPhone and iPad.
            </span>
          </div>
          <span
            style={{
              display: 'inline-block',
              ...smallBtnStyle,
              color: 'rgba(245, 240, 235, 0.35)',
              cursor: 'default',
            }}
          >
            Coming soon on TestFlight
          </span>
        </div>
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

      {/* OTLP / Custom — advanced, collapsed */}
      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />
      <details>
        <summary style={detailsSummaryStyle}>Custom OTLP integration</summary>
        <div style={{ ...descStyle, marginTop: 6, marginBottom: 8 }}>
          Send traces from your own app or OpenTelemetry Collector.
          Grab an API key from the top of this tab — works with both anonymous and signed-in keys.
        </div>

        <div style={{ ...labelStyle, fontSize: 10, marginBottom: 4, color: 'rgba(245, 240, 235, 0.22)' }}>
          Endpoint
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <code style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 12, color: 'rgba(245, 240, 235, 0.55)',
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 6, padding: '6px 10px',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {otlpEndpoint}
          </code>
          <button onClick={() => copyToClipboard(otlpEndpoint, 'url')} style={smallBtnStyle}>
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div style={{ ...descStyle, marginBottom: 6 }}>
          <strong style={{ color: 'rgba(245, 240, 235, 0.45)' }}>App SDK</strong>{' '}
          — set these env vars in the app you want to instrument.
        </div>
        <CopyBlock text={`OTEL_EXPORTER_OTLP_ENDPOINT=${otlpEndpoint}\nOTEL_EXPORTER_OTLP_PROTOCOL=http/json`} label="sdk-env" copied={copied} onCopy={copyToClipboard} style={codeBlockStyle} btnStyle={smallBtnStyle} />

        <div style={{ ...descStyle, marginTop: 10, marginBottom: 6 }}>
          <strong style={{ color: 'rgba(245, 240, 235, 0.45)' }}>OTel Collector</strong>{' '}
          — add as an exporter alongside your existing backends.
        </div>
        <CopyBlock text={`exporters:\n  otlphttp/streamscapes:\n    endpoint: ${otlpEndpoint}\n    encoding: json\n\nservice:\n  pipelines:\n    traces:\n      exporters: [otlphttp/streamscapes, ...]`} label="collector" copied={copied} onCopy={copyToClipboard} style={codeBlockStyle} btnStyle={smallBtnStyle} />
      </details>

      {/* Flush stream — clear buffered ingest data */}
      {isAuthed && <FlushStreamButton labelStyle={labelStyle} smallBtnStyle={smallBtnStyle} />}
    </div>
  );
}

/** Code block with a small copy button in the top-right corner */
function CopyBlock({ text, label, copied, onCopy, style, btnStyle }: {
  text: string;
  label: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
  style: CSSProperties;
  btnStyle: CSSProperties;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={style}>{text}</div>
      <button
        onClick={() => onCopy(text, label)}
        style={{
          ...btnStyle,
          position: 'absolute',
          top: 4,
          right: 4,
          padding: '2px 8px',
          fontSize: 10,
        }}
      >
        {copied === label ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function FlushStreamButton({ labelStyle, smallBtnStyle }: { labelStyle: CSSProperties; smallBtnStyle: CSSProperties }) {
  const [state, setState] = useState<'idle' | 'flushing' | 'done'>('idle');

  const flush = useCallback(async () => {
    setState('flushing');
    try {
      await fetch('/api/user/flush-stream', { method: 'DELETE' });
      setState('done');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('idle');
    }
  }, []);

  return (
    <>
      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Stream Buffer</div>
        <div style={{
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 11,
          color: 'rgba(245, 240, 235, 0.25)',
          marginBottom: 8,
          lineHeight: 1.5,
        }}>
          Clear buffered ingest data to stop replaying old spans on reconnect.
        </div>
        <button onClick={flush} disabled={state !== 'idle'} style={smallBtnStyle}>
          {state === 'flushing' ? 'Flushing...' : state === 'done' ? 'Flushed' : 'Flush Stream'}
        </button>
      </div>
    </>
  );
}
