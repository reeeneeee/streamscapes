"use client";

import { useStore } from '@/store';
import type { SynthType } from '@/types/sonification';

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: 'Synth', label: 'Sine' },
  { value: 'FMSynth', label: 'FM' },
  { value: 'AMSynth', label: 'AM' },
  { value: 'PluckSynth', label: 'Pluck' },
  { value: 'MembraneSynth', label: 'Membrane' },
  { value: 'NoiseSynth', label: 'Noise' },
];

const STREAM_COLORS: Record<string, string> = {
  weather: '#7C444F',
  flights: '#5C7285',
  wikipedia: '#5D8736',
  rss: '#B8860B',
  crypto: '#E6A817',
};

export default function SonificationPanel() {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);
  const setSelected = useStore((s) => s.setSelectedChannel);

  const channelIds = Object.keys(channels).filter((id) => channels[id].enabled);

  if (channelIds.length === 0) {
    return null;
  }

  const activeId = selectedId && channels[selectedId]?.enabled ? selectedId : channelIds[0];
  const config = channels[activeId];
  if (!config) return null;

  const envelope = (config.synthOptions.envelope as Record<string, number>) ?? {
    attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3,
  };
  const color = STREAM_COLORS[activeId] ?? '#888';

  const updateEnvelope = (param: string, value: number) => {
    updateChannel(activeId, {
      synthOptions: {
        ...config.synthOptions,
        envelope: { ...envelope, [param]: value },
      },
    });
  };

  return (
    <div className="rounded-lg p-3" style={{ background: '#1a1a1a' }}>
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Sonification</div>

      {/* Channel tabs */}
      <div className="flex gap-1 mb-3">
        {channelIds.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className="text-[11px] px-2 py-1 rounded transition-colors"
            style={{
              background: id === activeId ? (STREAM_COLORS[id] ?? '#555') : '#333',
              color: id === activeId ? '#fff' : '#888',
            }}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Synth type */}
      <div className="mb-3">
        <div className="text-[10px] text-gray-500 mb-1">Synth Type</div>
        <div className="grid grid-cols-3 gap-1">
          {SYNTH_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateChannel(activeId, { synthType: value })}
              className="text-[10px] px-1.5 py-1 rounded transition-colors"
              style={{
                background: config.synthType === value ? color : '#333',
                color: config.synthType === value ? '#fff' : '#888',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Envelope (not applicable to NoiseSynth) */}
      {config.synthType !== 'NoiseSynth' && (
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Envelope</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <EnvelopeKnob label="Attack" value={envelope.attack ?? 0.01} min={0.001} max={2} onChange={(v) => updateEnvelope('attack', v)} />
            <EnvelopeKnob label="Decay" value={envelope.decay ?? 0.2} min={0.01} max={2} onChange={(v) => updateEnvelope('decay', v)} />
            <EnvelopeKnob label="Sustain" value={envelope.sustain ?? 0.5} min={0} max={1} onChange={(v) => updateEnvelope('sustain', v)} />
            <EnvelopeKnob label="Release" value={envelope.release ?? 0.3} min={0.01} max={5} onChange={(v) => updateEnvelope('release', v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function EnvelopeKnob({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-400 font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: '#888' }}
      />
    </div>
  );
}
