"use client";

import { useStore } from '@/store';
import { STREAM_CSS_COLORS } from '@/lib/stream-constants';
import type { AudioEngine } from '@/lib/audio-engine';

export default function TransportBar({
  engine,
  onStop,
}: {
  engine: AudioEngine | null;
  onStop: () => void;
}) {
  const channels = useStore((s) => s.channels);
  const activeStreams = useStore((s) => s.activeStreams);
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);

  return (
    <div className="transport-bar">
      {/* Stop button */}
      <button
        onClick={onStop}
        className="text-[11px] px-2.5 py-1 rounded font-medium transition-colors"
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}
        title="Stop all audio and streams"
      >
        Stop
      </button>

      {/* Stream status dots */}
      <div className="flex items-center gap-1.5">
        {Object.keys(channels).map((id) => {
          const status = activeStreams[id]?.status;
          const enabled = channels[id]?.enabled;
          if (!enabled) return null;
          return (
            <div
              key={id}
              className="w-2 h-2 rounded-full"
              title={id}
              style={{
                background: status === 'connected'
                  ? STREAM_CSS_COLORS[id] ?? '#888'
                  : status === 'error' ? '#ef4444'
                  : '#444',
                opacity: status === 'connected' ? 1 : 0.5,
              }}
            />
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Master volume */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--text-muted)]">Vol</span>
        <input
          type="range"
          min={-40}
          max={6}
          step={0.5}
          value={global.masterVolume}
          onChange={(e) => updateGlobal({ masterVolume: parseFloat(e.target.value) })}
          className="w-20 h-1"
          style={{ accentColor: 'var(--accent)', touchAction: 'none' }}
        />
        <span className="text-[10px] text-[var(--text-muted)] w-8 text-right font-mono">
          {global.masterVolume > -40 ? `${global.masterVolume.toFixed(0)}` : '-∞'}
        </span>
      </div>
    </div>
  );
}
