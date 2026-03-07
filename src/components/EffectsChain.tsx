"use client";

import { useStore } from '@/store';
import type { EffectType, EffectConfig } from '@/types/sonification';

const EFFECT_TYPES: { value: EffectType; label: string }[] = [
  { value: 'reverb', label: 'Reverb' },
  { value: 'delay', label: 'Delay' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'distortion', label: 'Distortion' },
  { value: 'filter', label: 'Filter' },
  { value: 'compressor', label: 'Compressor' },
];

const DEFAULT_EFFECT_PARAMS: Record<EffectType, Record<string, number>> = {
  reverb: { decay: 2.5, preDelay: 0.01 },
  delay: { delayTime: 0.25, feedback: 0.3 },
  chorus: { frequency: 1.5, depth: 0.7, delayTime: 3.5 },
  distortion: { distortion: 0.4 },
  filter: { frequency: 1000, Q: 1 },
  compressor: { threshold: -24, ratio: 4 },
};

const MAX_EFFECTS = 4;

export default function EffectsChain() {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);

  const channelIds = Object.keys(channels).filter((id) => channels[id].enabled);
  const activeId = selectedId && channels[selectedId]?.enabled ? selectedId : channelIds[0];
  const config = channels[activeId];
  if (!config) return null;

  const effects = [...config.effects];

  const addEffect = (type: EffectType) => {
    if (effects.length >= MAX_EFFECTS) return;
    const newEffect: EffectConfig = {
      type,
      wet: 0.5,
      bypass: false,
      params: { ...DEFAULT_EFFECT_PARAMS[type] },
    };
    updateChannel(activeId, { effects: [...effects, newEffect] });
  };

  const removeEffect = (index: number) => {
    const next = effects.filter((_, i) => i !== index);
    updateChannel(activeId, { effects: next });
  };

  const updateEffect = (index: number, partial: Partial<EffectConfig>) => {
    const next = effects.map((e, i) => (i === index ? { ...e, ...partial } : e));
    updateChannel(activeId, { effects: next });
  };

  const updateEffectParam = (index: number, param: string, value: number) => {
    const next = effects.map((e, i) =>
      i === index ? { ...e, params: { ...e.params, [param]: value } } : e
    );
    updateChannel(activeId, { effects: next });
  };

  const moveEffect = (index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= effects.length) return;
    const next = [...effects];
    [next[index], next[newIdx]] = [next[newIdx], next[index]];
    updateChannel(activeId, { effects: next });
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div className="panel-title !mb-0">
          Effects <span style={{ color: 'var(--text-muted)' }}>({activeId})</span>
        </div>
        <span className="text-[10px] text-gray-600">{effects.length}/{MAX_EFFECTS}</span>
      </div>

      {/* Effect slots */}
      {effects.map((effect, i) => (
        <div
          key={i}
          className="mb-2 p-2 rounded"
          style={{
            background: effect.bypass ? '#222' : '#2a2a2a',
            opacity: effect.bypass ? 0.5 : 1,
          }}
        >
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[11px] text-gray-300 flex-1">{effect.type}</span>
            <button
              onClick={() => moveEffect(i, -1)}
              className="text-[10px] text-gray-500 hover:text-gray-300 px-0.5"
              disabled={i === 0}
            >▲</button>
            <button
              onClick={() => moveEffect(i, 1)}
              className="text-[10px] text-gray-500 hover:text-gray-300 px-0.5"
              disabled={i === effects.length - 1}
            >▼</button>
            <button
              onClick={() => updateEffect(i, { bypass: !effect.bypass })}
              className="text-[10px] px-1 py-0.5 rounded"
              style={{
                background: effect.bypass ? '#555' : '#4ade80',
                color: effect.bypass ? '#999' : '#000',
              }}
            >
              {effect.bypass ? 'OFF' : 'ON'}
            </button>
            <button
              onClick={() => removeEffect(i)}
              className="text-[10px] text-red-400 hover:text-red-300 px-1"
            >✕</button>
          </div>

          {/* Wet */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-gray-500 w-8">Wet</span>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={effect.wet}
              onChange={(e) => updateEffect(i, { wet: parseFloat(e.target.value) })}
              className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: '#888' }}
            />
            <span className="text-[10px] text-gray-400 font-mono w-8 text-right">
              {Math.round(effect.wet * 100)}%
            </span>
          </div>

          {/* Params */}
          {Object.entries(effect.params).map(([param, value]) => (
            <div key={param} className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] text-gray-500 w-16 truncate">{param}</span>
              <input
                type="range"
                min={0}
                max={param === 'frequency' ? 5000 : param === 'Q' ? 10 : param === 'ratio' ? 20 : param === 'threshold' ? 0 : 10}
                step={0.01}
                value={value}
                onChange={(e) => updateEffectParam(i, param, parseFloat(e.target.value))}
                className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#888' }}
              />
              <span className="text-[10px] text-gray-400 font-mono w-10 text-right">
                {value < 10 ? value.toFixed(2) : Math.round(value)}
              </span>
            </div>
          ))}
        </div>
      ))}

      {/* Add effect */}
      {effects.length < MAX_EFFECTS && (
        <div className="flex flex-wrap gap-1 mt-1">
          {EFFECT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => addEffect(value)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200 transition-colors"
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
