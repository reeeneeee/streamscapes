"use client";

import { useState, useCallback, useEffect, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';

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

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
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
                Generate an API key for OTLP, webhooks, and the Datadog poller
              </div>
              <button onClick={generateApiKeyHandler} disabled={apiKeyLoading} style={smallBtnStyle}>
                {apiKeyLoading ? 'Generating...' : 'Generate API Key'}
              </button>
            </div>
          )}
        </div>
      )}

      {isAuthed && <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />}

      {/* Chrome Extension */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Chrome Extension</div>
        <div style={descStyle}>
          Streams browser signals — battery, CPU, memory, tab activity, and downloads — into your mixer. Each signal becomes its own channel.
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={detailsSummaryStyle}>Setup</summary>
          <div style={{ ...descStyle, marginTop: 6, lineHeight: 1.7 }}>
            1. Load the extension from <code style={{ fontSize: 10 }}>chrome://extensions</code> (Developer mode → Load unpacked → select the <code style={{ fontSize: 10 }}>chrome-extension/</code> folder in the <a href="https://github.com/reeeneeee/streamscapes" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #C4889A)', textDecoration: 'none' }}>repo</a>)<br />
            2. Click the extension icon → enter your API key and this URL<br />
            3. Signals start flowing automatically
          </div>
        </details>
      </div>

      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />

      {/* Streamscapes Agent */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Streamscapes Agent</div>
        <div style={descStyle}>
          Streams macOS notifications and Datadog traces into your mixer.
          Runs as a menu bar app — no terminal needed.
        </div>
        <a
          href="https://github.com/reeeneeee/streamscapes/releases"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            marginTop: 8,
            ...smallBtnStyle,
            color: 'rgba(245, 240, 235, 0.6)',
            textDecoration: 'none',
          }}
        >
          Download menu bar app
        </a>
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
          The pollers above already handle OTLP for you — no extra setup needed.
          You only need this section if you want to send traces from your own app
          or OpenTelemetry Collector directly, or if you&apos;re running
          streamscapes on a non-default host.
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
