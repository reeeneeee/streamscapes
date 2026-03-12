"use client";

import { useStore } from '@/store';
import { getStreamColor, getStreamLabel } from '@/lib/stream-constants';
import type { AudioEngine } from '@/lib/audio-engine';

const VOLUME_RANGES: Record<string, { min: number; max: number }> = {
  weather:   { min: -20, max: 5 },
  flights:   { min: -40, max: -5 },
  wikipedia: { min: -20, max: 10 },
};

function ChannelRow({ id }: { id: string }) {
  const config = useStore((s) => s.channels[id]);
  const updateChannel = useStore((s) => s.updateChannel);
  const removeChannel = useStore((s) => s.removeChannel);
  const status = useStore((s) => s.activeStreams[id]?.status);

  if (!config) return null;

  const color = getStreamColor(id);
  const label = getStreamLabel(id);
  const isOn = config.enabled && !config.mute;
  const range = VOLUME_RANGES[id] ?? { min: -30, max: 6 };
  const isDismissable = id.startsWith('otlp:') || id.startsWith('dd:');

  const toggle = () => {
    if (isOn) {
      updateChannel(id, { enabled: false, solo: false });
    } else {
      updateChannel(id, { enabled: true, mute: false });
    }
  };

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 rounded-lg transition-opacity"
      style={{
        padding: '10px 14px',
        background: 'rgba(255, 255, 255, 0.025)',
        opacity: isOn ? 1 : 0.4,
      }}
    >
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

      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 13, fontWeight: 500,
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

      {/* Dismiss button for sub-channels */}
      {isDismissable && (
        <button
          onClick={() => removeChannel(id)}
          title="Remove channel"
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            background: 'transparent',
            color: 'rgba(245, 240, 235, 0.15)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14, lineHeight: '20px',
            textAlign: 'center',
            padding: 0,
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

/** OTLP parent toggle — controls the SSE connection, no volume slider */
function OtlpToggleRow() {
  const config = useStore((s) => s.channels['otlp']);
  const updateChannel = useStore((s) => s.updateChannel);
  const status = useStore((s) => s.activeStreams['otlp']?.status);

  if (!config) return null;

  const isOn = config.enabled;

  const toggle = () => {
    updateChannel('otlp', { enabled: !isOn, mute: !isOn ? false : config.mute });
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg transition-opacity"
      style={{
        padding: '8px 14px',
        opacity: isOn ? 1 : 0.65,
      }}
    >
      <button
        onClick={toggle}
        title={isOn ? 'Disconnect personal signals' : 'Connect personal signals'}
        style={{
          width: 32, height: 18, borderRadius: 9, flexShrink: 0,
          background: isOn ? '#6A8CAF' : 'rgba(255, 255, 255, 0.08)',
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
      <div
        style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: status === 'connected' ? '#6A8CAF'
            : status === 'connecting' ? 'rgba(250, 204, 21, 0.6)'
            : 'rgba(255, 255, 255, 0.1)',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-display, var(--ff-display))',
          fontSize: 11, fontWeight: 500,
          color: isOn ? 'rgba(245, 240, 235, 0.5)' : 'rgba(245, 240, 235, 0.35)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
        }}
      >
        Personal Signals
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 10,
          color: 'rgba(245, 240, 235, 0.2)',
          marginLeft: 'auto',
        }}
      >
        {isOn ? 'connected' : 'off'}
      </span>
    </div>
  );
}

export default function Mixer({ engine }: { engine: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateGlobal = useStore((s) => s.updateGlobal);
  const removeChannel = useStore((s) => s.removeChannel);

  // Separate primary channels from OTLP/Datadog sub-channels
  const primaryIds: string[] = [];
  const otlpSubIds: string[] = [];
  const ddSubIds: string[] = [];
  for (const [id, config] of Object.entries(channels)) {
    if (id === 'otlp') continue;
    if (id.startsWith('dd:')) {
      ddSubIds.push(id);
    } else if (config.parentPluginId === 'otlp') {
      otlpSubIds.push(id);
    } else {
      primaryIds.push(id);
    }
  }

  const activeCount = Object.values(channels)
    .filter((ch) => ch.enabled && !ch.mute).length;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Primary channel rows */}
      {primaryIds.map((id) => <ChannelRow key={id} id={id} />)}

      {/* Live Signal section — OTLP + Datadog */}
      <div
        style={{
          marginTop: 8,
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 8,
          padding: '4px 0',
        }}
      >
        <OtlpToggleRow />

        {/* OTLP sub-channels */}
        {otlpSubIds.length > 0 && (
          <div style={{ padding: '0 0 4px' }}>
            <div className="flex items-center" style={{
              padding: '4px 14px 2px',
            }}>
              <span style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 9, fontWeight: 500,
                color: 'rgba(245, 240, 235, 0.2)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
              }}>
                OTLP
              </span>
              <button
                onClick={() => otlpSubIds.forEach((id) => removeChannel(id))}
                title="Remove all OTLP channels"
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 9, color: 'rgba(245, 240, 235, 0.15)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 2px',
                }}
              >
                clear all
              </button>
            </div>
            {otlpSubIds.map((id) => <ChannelRow key={id} id={id} />)}
          </div>
        )}

        {/* Datadog sub-channels */}
        {ddSubIds.length > 0 && (
          <div style={{
            padding: '0 0 4px',
            marginTop: otlpSubIds.length > 0 ? 4 : 0,
            borderTop: otlpSubIds.length > 0 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
          }}>
            <div className="flex items-center" style={{
              padding: '4px 14px 2px',
            }}>
              <span style={{
                fontFamily: 'var(--font-display, var(--ff-display))',
                fontSize: 9, fontWeight: 500,
                color: 'rgba(245, 240, 235, 0.2)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
              }}>
                Datadog
              </span>
              <button
                onClick={() => ddSubIds.forEach((id) => removeChannel(id))}
                title="Remove all Datadog channels"
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 9, color: 'rgba(245, 240, 235, 0.15)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 2px',
                }}
              >
                clear all
              </button>
            </div>
            {ddSubIds.map((id) => <ChannelRow key={id} id={id} />)}
          </div>
        )}
      </div>

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
