"use client";

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { STREAM_CSS_COLORS, getStreamColor, getStreamLabel } from '@/lib/stream-constants';
import type { AudioEngine } from '@/lib/audio-engine';
import type * as Tone from 'tone';

const SEG_COUNT = 6;

/** Mini vertical dotted VU column for a single channel */
function VuDots({ analyzer, color, status, label }: {
  analyzer: Tone.Analyser | null;
  color: string;
  status?: string;
  label: string;
}) {
  const [level, setLevel] = useState(0);
  const [showLabel, setShowLabel] = useState(false);
  const rafRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!analyzer) { setLevel(0); return; }
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 50) {
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

  const reveal = () => {
    clearTimeout(hideTimerRef.current);
    setShowLabel(true);
  };
  const hide = () => {
    hideTimerRef.current = setTimeout(() => setShowLabel(false), 1200);
  };

  const litSegs = Math.round(level * SEG_COUNT);
  const isConnecting = status === 'connecting';

  return (
    <div
      className="flex flex-col-reverse items-center gap-[2px]"
      style={{ width: 6, height: 38, position: 'relative', cursor: 'default' }}
      onMouseEnter={reveal}
      onMouseLeave={hide}
      onTouchStart={reveal}
      onTouchEnd={hide}
    >
      {/* Tooltip */}
      {showLabel && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 6,
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 10,
          fontWeight: 500,
          color: color,
          background: 'rgba(13, 13, 13, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 5,
          padding: '3px 7px',
          pointerEvents: 'none',
          zIndex: 60,
        }}>
          {label}
        </div>
      )}
      {Array.from({ length: SEG_COUNT }, (_, i) => {
        const isLit = i < litSegs;
        return (
          <div
            key={i}
            className={isConnecting && !isLit ? 'stream-dot-pulse' : ''}
            style={{
              width: 4, height: 4, borderRadius: '50%',
              background: isLit ? color
                : status === 'connected' ? color
                : status === 'connecting' ? color
                : status === 'error' ? '#ef4444'
                : '#333',
              opacity: isLit ? 0.5 + (i / SEG_COUNT) * 0.5
                : status === 'connected' ? 0.15
                : status === 'connecting' ? 0.25
                : 0.15,
              boxShadow: isLit ? `0 0 4px ${color}` : 'none',
              transition: 'opacity 0.06s',
            }}
          />
        );
      })}
    </div>
  );
}

export default function TransportBar({
  engine,
}: {
  engine: AudioEngine | null;
}) {
  const channels = useStore((s) => s.channels);
  const activeStreams = useStore((s) => s.activeStreams);
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);

  return (
    <div className="transport-bar">
      {/* Stream VU meters */}
      <div className="flex items-end gap-1.5">
        {Object.keys(channels).map((id) => {
          const enabled = channels[id]?.enabled;
          if (!enabled) return null;
          const color = STREAM_CSS_COLORS[id] ?? getStreamColor(id);
          const status = activeStreams[id]?.status;
          const analyzer = engine?.getChannelAnalyzer(id) ?? null;
          const label = getStreamLabel(id);
          return (
            <VuDots
              key={id}
              analyzer={analyzer}
              color={color}
              status={status}
              label={label}
            />
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Master volume */}
      <div className="flex items-center gap-2" style={{ width: '40%', maxWidth: 320, flexShrink: 0 }}>
        <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">Vol</span>
        <input
          type="range"
          min={-40}
          max={6}
          step={0.5}
          value={global.masterVolume}
          onChange={(e) => updateGlobal({ masterVolume: parseFloat(e.target.value) })}
          className="w-full h-1"
          style={{ accentColor: 'var(--accent)', touchAction: 'none' }}
        />
        <span className="text-[10px] text-[var(--text-muted)] w-8 text-right font-mono flex-shrink-0">
          {global.masterVolume > -40 ? `${global.masterVolume.toFixed(0)}` : '-∞'}
        </span>
      </div>
    </div>
  );
}
