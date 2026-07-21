"use client";

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { getStreamColor, getStreamLabel } from '@/lib/stream-constants';
import { getIntent } from '@/lib/intents';
import type { AudioEngine } from '@/lib/audio-engine';
import type * as Tone from 'tone';

/** Display field + optional unit suffix for each stream */
const DISPLAY_FIELDS: Record<string, { field: string; unit?: string }> = {
  'weather:temp': { field: 'feelsLike', unit: '°' },
  'weather:clouds': { field: 'clouds', unit: '%' },
  flights: { field: 'nearbyCount' },
  wikipedia: { field: 'title' },
  archive: { field: 'title' },
  rss: { field: 'title' },
  stocks: { field: 'price', unit: '$' },
};

function getDisplayField(streamId: string): { field: string; unit?: string } | null {
  if (DISPLAY_FIELDS[streamId]) return DISPLAY_FIELDS[streamId];
  if (streamId.startsWith('system:')) return { field: 'percent', unit: '%' };
  if (streamId === 'watch:heartRate') return { field: 'bpm', unit: ' BPM' };
  if (streamId === 'watch:steps') return { field: 'totalSteps' };
  if (streamId.startsWith('dd:')) return { field: 'durationMs', unit: 'ms' };
  if (streamId.startsWith('otlp:')) return { field: 'durationMs', unit: 'ms' };
  if (streamId.startsWith('notify:')) return { field: 'spanName' };
  if (streamId.startsWith('chrome:')) return { field: 'spanName' };
  return null;
}

/** Hook: returns the primary metric value from the last data point */
function useMetricValue(engine: AudioEngine | null | undefined, streamId: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  const display = getDisplayField(streamId);
  const fieldName = display?.field;
  const unit = display?.unit;

  useEffect(() => {
    if (!engine || !fieldName) { setValue(null); return; }

    const format = (v: unknown) => {
      if (typeof v === 'number') {
        const num = Number.isInteger(v) ? String(v) : v.toFixed(1);
        return unit === '$' ? `$${num}` : `${num}${unit ?? ''}`;
      }
      if (typeof v === 'string' && v.length > 0) {
        return v.length > 18 ? v.slice(0, 18) + '…' : v;
      }
      return null;
    };

    // Check cached value immediately
    const cached = engine.getLastDataPoint(streamId);
    if (cached) {
      const f = format(cached.fields[fieldName]);
      if (f) setValue(f);
    }

    // Listen for new data
    const listenerId = `metric-${streamId}`;
    engine.onData(listenerId, (dp) => {
      const f = format(dp.fields[fieldName]);
      if (f) setValue(f);
    }, streamId);

    return () => { engine.offData(listenerId); };
  }, [engine, streamId, fieldName, unit]);

  return value;
}

/** Hook: returns 0-1 RMS level from a Tone.Analyser, updated at ~30fps */
function useLevel(analyzer: Tone.Analyser | null): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!analyzer) { setLevel(0); return; }
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 33) { // ~30fps
        last = now;
        const data = analyzer.getValue() as Float32Array;
        let rms = 0;
        for (let i = 0; i < data.length; i++) rms += data[i] * data[i];
        rms = Math.sqrt(rms / data.length);
        setLevel(Math.min(1, rms * 4));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyzer]);

  return level;
}

const VOLUME_RANGES: Record<string, { min: number; max: number }> = {
  weather:   { min: -20, max: 5 },
  'weather:temp':   { min: -20, max: 5 },
  'weather:clouds': { min: -30, max: 0 },
  flights:   { min: -40, max: -5 },
  wikipedia: { min: -20, max: 10 },
};

function ChannelRow({ id, engine }: { id: string; engine?: AudioEngine | null }) {
  const config = useStore((s) => s.channels[id]);
  const updateChannel = useStore((s) => s.updateChannel);
  const removeChannel = useStore((s) => s.removeChannel);
  const status = useStore((s) => s.activeStreams[id]?.status);

  const analyzer = engine?.getChannelAnalyzer(id) ?? null;
  const level = useLevel(analyzer);
  const metricValue = useMetricValue(engine, id);

  if (!config) return null;

  const color = getStreamColor(id);
  const label = getStreamLabel(id);
  const isOn = config.enabled && !config.mute;
  const range = VOLUME_RANGES[id] ?? { min: -30, max: 6 };
  const isSubChannel = id.startsWith('otlp:') || id.startsWith('dd:') || id.startsWith('notify:') || id.startsWith('github:') || id.startsWith('chrome:') || id.startsWith('system:') || id.startsWith('watch:') || config.parentPluginId === 'otlp';
  const isDismissable = isSubChannel;
  const hasVisual = id === 'flights' || id === 'wikipedia' || id === 'archive';

  const toggle = () => {
    if (isOn) {
      updateChannel(id, { enabled: false, solo: false });
    } else {
      updateChannel(id, { enabled: true, mute: false });
    }
  };

  return (
    <div
      className="rounded-lg transition-opacity"
      style={{
        padding: '10px 14px',
        background: 'rgba(255, 255, 255, 0.025)',
        opacity: isOn ? 1 : 0.4,
      }}
    >
     <div className="flex items-center gap-2 sm:gap-3">
      {/* On/off toggle */}
      <button
        onClick={toggle}
        title={isOn ? 'Turn off' : 'Turn on'}
        style={{
          width: 32, height: 18, borderRadius: 9, flexShrink: 0,
          background: isOn ? color : 'rgba(255, 255, 255, 0.08)',
          position: 'relative',
          cursor: 'pointer',
          border: 'none',
          transition: 'background 0.15s',
        }}
      >
        <div
          style={{
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: isOn ? 16 : 2,
            transition: 'left 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>

      {/* Status dot */}
      <div
        style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: status === 'error' ? '#ef4444'
            : status === 'connected' ? color
            : status === 'connecting' ? 'rgba(250, 204, 21, 0.6)'
            : 'rgba(255, 255, 255, 0.1)',
          boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none',
        }}
      />

      {/* Label + intent + live metric */}
      <div style={{ minWidth: 40, maxWidth: 200, flexShrink: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap' as const,
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          {metricValue != null && (
            <span
              style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 11, fontWeight: 400,
                color: '#fff',
                opacity: 0.5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {metricValue}
            </span>
          )}
        </div>
        {config.intent && getIntent(config.intent)?.name && (
          <span
            style={{
              fontFamily: 'var(--font-display, var(--ff-display))',
              fontSize: 9, fontWeight: 400,
              color: 'rgba(245, 240, 235, 0.3)',
              letterSpacing: '0.05em',
            }}
          >
            {getIntent(config.intent)?.name}
          </span>
        )}
      </div>

      {/* Volume slider with VU level fill */}
      <div className="flex-1" style={{ position: 'relative', height: 18 }}>
        {/* Level fill behind slider */}
        <div style={{
          position: 'absolute', left: 0, top: 7, height: 4, borderRadius: 2,
          width: `${Math.max(0, level * 100)}%`,
          background: color,
          opacity: 0.35 + level * 0.35,
          boxShadow: level > 0.1 ? `0 0 8px ${color}` : 'none',
          transition: 'width 0.05s linear',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={0.5}
          value={config.volume}
          onChange={(e) => updateChannel(id, { volume: parseFloat(e.target.value) })}
          className="w-full"
          style={{
            position: 'relative',
            touchAction: 'none',
            zIndex: 1,
          }}
        />
      </div>

      {/* dB readout — hidden on very small screens */}
      <span
        className="hidden sm:inline"
        style={{
          fontFamily: 'var(--font-display, var(--ff-display))',
          fontSize: 11, fontWeight: 400,
          color: 'rgba(245, 240, 235, 0.3)',
          width: 46, textAlign: 'right', flexShrink: 0,
        }}
      >
        {config.volume.toFixed(1)} dB
      </span>

      {/* Visual toggle — fixed-width slot for alignment */}
      <div style={{ display: 'flex', gap: 4, width: 24, flexShrink: 0, justifyContent: 'flex-end' }}>
        {hasVisual && (
          <button
            onClick={() => updateChannel(id, { visualEnabled: config.visualEnabled === false })}
            title={config.visualEnabled === false ? 'Show visuals' : 'Hide visuals'}
            style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              background: config.visualEnabled === false ? 'transparent' : 'rgba(255, 255, 255, 0.06)',
              color: config.visualEnabled === false ? 'rgba(245, 240, 235, 0.12)' : 'rgba(245, 240, 235, 0.45)',
              border: config.visualEnabled === false ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              fontSize: 12, lineHeight: '18px', textAlign: 'center', padding: 0,
            }}
          >
            {'\u{1F441}'}
          </button>
        )}
      </div>

      {/* Dismiss button for sub-channels */}
      {isDismissable && (
        <button
          onClick={() => removeChannel(id)}
          title="Remove channel"
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            background: 'transparent',
            color: 'rgba(245, 240, 235, 0.4)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16, lineHeight: '20px',
            textAlign: 'center',
            padding: 0,
          }}
        >
          &times;
        </button>
      )}
     </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  dd: 'Datadog',
  otlp: 'Services',
  system: 'System',
  notify: 'Notifications',
  github: 'GitHub',
  chrome: 'Chrome Extension',
  watch: 'Apple Watch',
};

function SourceGroupRow({ prefix, ids, engine }: { prefix: string; ids: string[]; engine?: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const updateChannel = useStore((s) => s.updateChannel);
  const [collapsed, setCollapsed] = useState(false);

  const label = SOURCE_LABELS[prefix] ?? prefix;
  const color = getStreamColor(ids[0] ?? `${prefix}:unknown`);
  const allSoundOff = ids.every((id) => channels[id]?.soundEnabled === false);
  const allVisualOff = ids.every((id) => channels[id]?.visualEnabled === false);

  const toggleSound = () => {
    const newVal = allSoundOff ? undefined : false;
    ids.forEach((id) => updateChannel(id, { soundEnabled: newVal }));
  };
  const toggleVisual = () => {
    const newVal = allVisualOff ? undefined : false;
    ids.forEach((id) => updateChannel(id, { visualEnabled: newVal }));
  };

  const btnStyle = (isOff: boolean): React.CSSProperties => ({
    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
    background: isOff ? 'transparent' : 'rgba(255, 255, 255, 0.06)',
    color: isOff ? 'rgba(245, 240, 235, 0.12)' : 'rgba(245, 240, 235, 0.45)',
    border: isOff ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    fontSize: 12, lineHeight: '18px', textAlign: 'center', padding: 0,
  });

  const sortedIds = [...ids].sort((a, b) => {
    const aAll = a.endsWith(':[all]') ? 0 : 1;
    const bAll = b.endsWith(':[all]') ? 0 : 1;
    if (aAll !== bAll) return aAll - bAll;
    return a.localeCompare(b);
  });

  return (
    <div>
      {/* Source header — click to collapse/expand */}
      <div
        className="flex items-center gap-2"
        style={{ padding: '6px 14px', cursor: 'pointer' }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{
          fontSize: 8,
          color: 'rgba(245, 240, 235, 0.2)',
          transition: 'transform 0.15s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          flexShrink: 0,
          width: 8,
        }}>
          {'\u25BC'}
        </span>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--font-display, var(--ff-display))',
          fontSize: 11, fontWeight: 500,
          color: 'rgba(245, 240, 235, 0.4)',
          letterSpacing: '0.06em',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 10,
          color: 'rgba(245, 240, 235, 0.18)',
        }}>
          {ids.length}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); toggleSound(); }} title={allSoundOff ? 'Enable sound' : 'Mute sound'} style={btnStyle(allSoundOff)}>
          {'\u{1F442}'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); toggleVisual(); }} title={allVisualOff ? 'Show visuals' : 'Hide visuals'} style={btnStyle(allVisualOff)}>
          {'\u{1F441}'}
        </button>
      </div>
      {/* Sub-channel rows — collapsible */}
      {!collapsed && sortedIds.map((id) => <ChannelRow key={id} id={id} engine={engine} />)}
    </div>
  );
}

export default function Mixer({ engine }: { engine: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);

  const updateChannel = useStore((s) => s.updateChannel);

  // Separate primary (public) channels from private ingest sub-channels
  const hiddenParents = new Set(['otlp', 'weather']);
  const primaryIds: string[] = [];
  const sourceGroups = new Map<string, string[]>();
  const HIDDEN_CHANNELS = new Set(['system:status', 'docker:status']);
  for (const [id, config] of Object.entries(channels)) {
    if (hiddenParents.has(id) || HIDDEN_CHANNELS.has(id)) continue;
    if (id.startsWith('dd:') || id.startsWith('notify:') || id.startsWith('github:') || id.startsWith('chrome:') || id.startsWith('system:') || id.startsWith('watch:') || config.parentPluginId === 'otlp') {
      const prefix = id.split(':')[0];
      if (!sourceGroups.has(prefix)) sourceGroups.set(prefix, []);
      sourceGroups.get(prefix)!.push(id);
    } else {
      primaryIds.push(id);
    }
  }

  const activeCount = Object.values(channels)
    .filter((ch) => ch.enabled && !ch.mute).length;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Section label: Public */}
      <div style={{
        padding: '4px 14px 6px',
        fontFamily: 'var(--font-display, var(--ff-display))',
        fontSize: 10, fontWeight: 500,
        color: 'rgba(245, 240, 235, 0.2)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
      }}>
        Public
      </div>

      {/* Primary channel rows — with inline config for stocks + rss */}
      {primaryIds.map((id) => (
        <div key={id}>
          <ChannelRow id={id} engine={engine} />
          {id === 'stocks' && <StockSymbolsInline />}
          {id === 'rss' && <RssFeedsInline />}
        </div>
      ))}

      {/* Section label: Private */}
      <div style={{
        padding: '10px 14px 6px',
        fontFamily: 'var(--font-display, var(--ff-display))',
        fontSize: 10, fontWeight: 500,
        color: 'rgba(245, 240, 235, 0.2)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
      }}>
        Private
        <a
          href="#forward-notifications"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('forward-notifications')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            fontFamily: 'var(--font-body, var(--ff-body))',
            fontSize: 10,
            fontWeight: 400,
            color: 'rgba(245, 240, 235, 0.15)',
            letterSpacing: '0.02em',
            textTransform: 'none' as const,
            textDecoration: 'none',
          }}
        >
          Forward chrome and macOS system notifications ↓
        </a>
      </div>

      {/* Private sub-channels — grouped by source */}
      {[...sourceGroups.entries()].map(([prefix, ids]) => (
        <SourceGroupRow key={prefix} prefix={prefix} ids={ids} engine={engine} />
      ))}

      {/* Master volume */}
      <div
        className="flex items-center gap-3"
        style={{ padding: '14px 14px', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 11, fontWeight: 500,
            color: 'rgba(245, 240, 235, 0.35)',
            letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            flexShrink: 0,
          }}
        >
          Master
        </span>
        <input
          type="range"
          min={-40}
          max={6}
          step={0.5}
          value={global.masterVolume}
          onChange={(e) => updateGlobal({ masterVolume: parseFloat(e.target.value) })}
          className="flex-1"
          style={{ touchAction: 'none' }}
        />
        <span
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 13, fontWeight: 400,
            color: 'rgba(245, 240, 235, 0.5)',
            width: 52, textAlign: 'right', flexShrink: 0,
          }}
        >
          {global.masterVolume > -40 ? `${global.masterVolume.toFixed(1)}` : '-\u221E'} dB
        </span>
      </div>

      {/* Footer metadata */}
      <div className="flex items-center gap-4" style={{ padding: '8px 14px 0' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-body, var(--ff-body))', fontSize: 11, fontWeight: 400, color: 'rgba(245,240,235,0.25)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={global.tempo}
            onChange={(e) => updateGlobal({ tempo: parseInt(e.target.value) || 120 })}
            style={{
              fontFamily: 'var(--font-display, var(--ff-display))',
              fontSize: 14, fontWeight: 400,
              color: 'rgba(245,240,235,0.6)',
              background: 'transparent', border: 'none',
              width: 44,
            }}
          />
        </div>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.06)' }} />
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-body, var(--ff-body))', fontSize: 11, fontWeight: 400, color: 'rgba(245,240,235,0.25)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            {activeCount} active
          </span>
        </div>
      </div>
    </div>
  );
}

/** Inline tag editor for stock symbols, shown under the Stocks channel row */
function StockSymbolsInline() {
  const symbols = useStore((s) => s.stockSymbols);
  const setStockSymbols = useStore((s) => s.setStockSymbols);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const sym = input.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) setStockSymbols([...symbols, sym]);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ padding: '4px 14px 6px 52px', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {symbols.map((sym) => (
        <span key={sym} style={{
          fontFamily: 'monospace', fontSize: 10,
          color: 'rgba(245, 240, 235, 0.45)',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 4, padding: '2px 6px',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {sym}
          <button onClick={() => setStockSymbols(symbols.filter((s) => s !== sym))} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(245, 240, 235, 0.2)', fontSize: 11, padding: 0, lineHeight: 1,
          }}>&times;</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="e.g. AAPL"
        className="placeholder-input"
        style={{
          fontFamily: 'monospace', fontSize: 10,
          color: 'var(--text-primary)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(255, 255, 255, 0.08)',
          borderRadius: 4, padding: '2px 6px',
          width: 72, outline: 'none',
        }}
      />
    </div>
  );
}

/** Inline tag editor for RSS feed URLs, shown under the RSS channel row */
function RssFeedsInline() {
  const feeds = useStore((s) => s.rssFeeds);
  const setRssFeeds = useStore((s) => s.setRssFeeds);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const url = input.trim();
    if (url && !feeds.includes(url)) setRssFeeds([...feeds, url]);
    setInput('');
    inputRef.current?.focus();
  };

  const label = (url: string) => {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url.slice(0, 20); }
  };

  return (
    <div style={{ padding: '4px 14px 6px 52px', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {feeds.map((url) => (
        <span key={url} style={{
          fontFamily: 'monospace', fontSize: 10,
          color: 'rgba(245, 240, 235, 0.45)',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 4, padding: '2px 6px',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }} title={url}>
          {label(url)}
          <button onClick={() => setRssFeeds(feeds.filter((f) => f !== url))} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(245, 240, 235, 0.2)', fontSize: 11, padding: 0, lineHeight: 1,
          }}>&times;</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="e.g. https://hn.algolia.com/api/v1/..."
        className="placeholder-input"
        style={{
          fontFamily: 'monospace', fontSize: 10,
          color: 'var(--text-primary)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(255, 255, 255, 0.08)',
          borderRadius: 4, padding: '2px 6px',
          width: 200, outline: 'none',
        }}
      />
    </div>
  );
}
