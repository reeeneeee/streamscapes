"use client";

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store';

interface DdStatus {
  configured: boolean;
  polling: boolean;
  site?: string;
  query?: string;
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
  const [copied, setCopied] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  // Datadog form state
  const [ddApiKey, setDdApiKey] = useState('');
  const [ddAppKey, setDdAppKey] = useState('');
  const [ddSite, setDdSite] = useState('datadoghq.com');
  const [ddQuery, setDdQuery] = useState('');
  const [ddStatus, setDdStatus] = useState<DdStatus>({ configured: false, polling: false });

  const otlpEndpoint = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ingest/otlp`
    : 'http://localhost:3000/api/ingest/otlp';

  // Poll DD status
  useEffect(() => {
    const poll = () => {
      fetch('/api/ingest/datadog')
        .then((r) => r.json())
        .then((s) => setDdStatus(s))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const sendTestSpan = useCallback(async () => {
    const body = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }] },
        scopeSpans: [{
          spans: [{
            name: 'test-span',
            kind: 2,
            startTimeUnixNano: String(Date.now() * 1_000_000),
            endTimeUnixNano: String(Date.now() * 1_000_000 + 250_000_000),
            status: { code: 1 },
            attributes: [],
          }],
        }],
      }],
    };
    await fetch('/api/ingest/otlp/v1/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 2000);
  }, []);

  const configureDd = useCallback(async () => {
    await fetch('/api/ingest/datadog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: ddApiKey, appKey: ddAppKey, site: ddSite, query: ddQuery }),
    });
    setDdStatus({ configured: true, polling: true, site: ddSite, query: ddQuery });
  }, [ddApiKey, ddAppKey, ddSite, ddQuery]);

  const clearDd = useCallback(async () => {
    await fetch('/api/ingest/datadog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    setDdStatus({ configured: false, polling: false });
    setDdApiKey('');
    setDdAppKey('');
    setDdQuery('');
  }, []);

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

  return (
    <div className="flex flex-col gap-5">
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={sendTestSpan} style={smallBtnStyle}>
            {testSent ? 'Sent!' : 'Send test span'}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.05)' }} />

      {/* Datadog Section */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 10 }}>Datadog</div>

        {ddStatus.configured ? (
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 12,
                color: ddStatus.polling ? 'rgba(74, 222, 128, 0.7)' : 'rgba(245, 240, 235, 0.4)',
                marginBottom: 8,
              }}
            >
              {ddStatus.polling ? 'Polling every 15s' : 'Configured (not polling)'}
              {ddStatus.site && ` \u00B7 ${ddStatus.site}`}
              {ddStatus.query && ` \u00B7 ${ddStatus.query}`}
            </div>
            <button onClick={clearDd} style={{ ...smallBtnStyle, color: 'rgba(239, 68, 68, 0.7)' }}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div>
              <div style={labelStyle}>API Key</div>
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
            <button
              onClick={configureDd}
              disabled={!ddApiKey || !ddAppKey}
              style={{
                ...smallBtnStyle,
                opacity: (!ddApiKey || !ddAppKey) ? 0.3 : 1,
                marginTop: 4,
              }}
            >
              Connect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
