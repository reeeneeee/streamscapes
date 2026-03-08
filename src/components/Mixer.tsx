"use client";

import { useStore } from '@/store';
import { STREAM_COLORS, STREAM_LABELS } from '@/lib/stream-constants';
import type { AudioEngine } from '@/lib/audio-engine';

const VOLUME_RANGES: Record<string, { min: number; max: number }> = {
  weather:   { min: -20, max: 5 },
  flights:   { min: -40, max: -5 },
  wikipedia: { min: -20, max: 10 },
};


export default function Mixer({ engine }: { engine: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateChannel = useStore((s) => s.updateChannel);
  const updateGlobal = useStore((s) => s.updateGlobal);
  const activeStreams = useStore((s) => s.activeStreams);

  const channelIds = Object.keys(channels);

  return (
    <div className="flex flex-col gap-0.5">
      {/* Channel rows */}
      {channelIds.map((id) => {
        const config = channels[id];
        const color = STREAM_COLORS[id] ?? '#888';
        const label = STREAM_LABELS[id] ?? id;
        const status = activeStreams[id]?.status;
        const isMuted = config.mute;
        const isSolo = config.solo;
        const isOff = !config.enabled;
        const dimmed = isOff || isMuted;
        const range = VOLUME_RANGES[id] ?? { min: -30, max: 6 };

        return (
          <div
            key={id}
            className="flex items-center gap-2 sm:gap-3 rounded-lg transition-opacity"
            style={{
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.025)',
              opacity: dimmed ? 0.4 : 1,
            }}
          >
            {/* Accent dot + connection status */}
            <div
              style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: status === 'error' ? '#ef4444' : color,
                boxShadow: status === 'connected' ? `0 0 6px ${color}` : 'none',
              }}
            />

            {/* Stream name */}
            <span
              style={{
                fontFamily: 'var(--font-body, var(--ff-body))',
                fontSize: 14, fontWeight: 500,
                color: 'var(--text-primary)',
                width: 70, flexShrink: 0,
              }}
            >
              {label}
            </span>

            {/* Volume slider */}
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={0.5}
              value={config.volume}
              onChange={(e) => updateChannel(id, { volume: parseFloat(e.target.value) })}
              className="flex-1 h-1 rounded-sm appearance-none cursor-pointer"
              style={{
                accentColor: 'rgba(245, 240, 235, 0.4)',
                background: 'rgba(255, 255, 255, 0.08)',
                touchAction: 'none',
              }}
            />

            {/* dB readout */}
            <span
              style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 11, fontWeight: 400,
                color: 'rgba(245, 240, 235, 0.3)',
                width: 46, textAlign: 'right', flexShrink: 0,
              }}
            >
              {config.volume.toFixed(1)} dB
            </span>

            {/* Solo */}
            <button
              onClick={() => {
                if (isSolo) {
                  updateChannel(id, { solo: false });
                } else {
                  updateChannel(id, { enabled: true, solo: true, mute: false });
                }
              }}
              title={isSolo ? 'Un-solo' : 'Solo — hear only this stream'}
              style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 11, fontWeight: 600, lineHeight: '26px',
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                textAlign: 'center',
                background: isSolo ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
                color: isSolo ? 'rgba(250, 204, 21, 0.9)' : 'rgba(245, 240, 235, 0.2)',
                border: `1px solid ${isSolo ? 'rgba(250, 204, 21, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                cursor: 'pointer',
              }}
            >
              S
            </button>

            {/* Mute */}
            <button
              onClick={() => {
                if (isOff) {
                  updateChannel(id, { enabled: true, mute: false });
                } else {
                  updateChannel(id, { mute: !isMuted });
                }
              }}
              title={isMuted ? 'Unmute' : isOff ? 'Enable' : 'Mute'}
              style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 11, fontWeight: 600, lineHeight: '26px',
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                textAlign: 'center',
                background: (isMuted || isOff) ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                color: (isMuted || isOff) ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 240, 235, 0.2)',
                border: `1px solid ${(isMuted || isOff) ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
                cursor: 'pointer',
              }}
            >
              M
            </button>
          </div>
        );
      })}

      {/* Master volume */}
      <div
        className="flex items-center gap-3"
        style={{ padding: '18px 14px', marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 11, fontWeight: 500,
            color: 'rgba(245, 240, 235, 0.35)',
            letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            width: 86, flexShrink: 0,
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
          className="flex-1 h-1.5 rounded-sm appearance-none cursor-pointer"
          style={{
            accentColor: 'rgba(245, 240, 235, 0.4)',
            background: 'rgba(255, 255, 255, 0.08)',
            touchAction: 'none',
          }}
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
      <div className="flex items-center gap-4" style={{ padding: '12px 14px 0' }}>
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
            {channelIds.filter((id) => channels[id].enabled && !channels[id].mute).length} active
          </span>
        </div>
      </div>
    </div>
  );
}
