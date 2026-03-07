"use client";

import { useStore } from '@/store';
import type { SonificationMapping, MappingCurve } from '@/types/sonification';

const CURVES: MappingCurve[] = ['linear', 'logarithmic', 'exponential', 'step'];

const KNOWN_SOURCE_FIELDS: Record<string, string[]> = {
  weather: ['temperature', 'feelsLike', 'clouds', 'humidity', 'windSpeed'],
  flights: ['distance', 'speed', 'altitude', 'frequency', 'lat', 'lon'],
  wikipedia: ['titleLength', 'lengthDelta', 'absLengthDelta'],
};

const TARGET_PARAMS = [
  'frequency', 'velocity', 'scaleIndex', 'filterCutoff',
  'noiseVolume', 'patternSelect', 'pan', 'detune',
];

export default function MappingEditor() {
  const channels = useStore((s) => s.channels);
  const selectedId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);

  const channelIds = Object.keys(channels).filter((id) => channels[id].enabled);
  const activeId = selectedId && channels[selectedId]?.enabled ? selectedId : channelIds[0];
  const config = channels[activeId];
  if (!config) return null;

  const mappings = [...config.mappings];
  const sourceFields = KNOWN_SOURCE_FIELDS[activeId] ?? [];

  const addMapping = () => {
    const newMapping: SonificationMapping = {
      sourceField: sourceFields[0] ?? 'value',
      targetParam: 'frequency',
      curve: 'linear',
      inputRange: [0, 100],
      outputRange: [0, 1],
      invert: false,
    };
    updateChannel(activeId, { mappings: [...mappings, newMapping] });
  };

  const removeMapping = (index: number) => {
    updateChannel(activeId, { mappings: mappings.filter((_, i) => i !== index) });
  };

  const updateMapping = (index: number, partial: Partial<SonificationMapping>) => {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...partial } : m));
    updateChannel(activeId, { mappings: next });
  };

  return (
    <div className="rounded-lg p-3" style={{ background: '#1a1a1a' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Mappings <span className="text-gray-600">({activeId})</span>
        </div>
        <button
          onClick={addMapping}
          className="text-[10px] px-2 py-0.5 rounded bg-[#333] text-gray-400 hover:text-gray-200"
        >
          + Add
        </button>
      </div>

      {mappings.map((m, i) => (
        <div key={i} className="mb-2 p-2 rounded" style={{ background: '#2a2a2a' }}>
          <div className="flex items-center gap-1 mb-1.5">
            {/* Source field */}
            <select
              value={m.sourceField}
              onChange={(e) => updateMapping(i, { sourceField: e.target.value })}
              className="text-[11px] rounded px-1 py-0.5 flex-1"
              style={{ background: '#333', color: '#ddd', border: 'none' }}
            >
              {sourceFields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <span className="text-[10px] text-gray-500">→</span>

            {/* Target param */}
            <select
              value={m.targetParam}
              onChange={(e) => updateMapping(i, { targetParam: e.target.value })}
              className="text-[11px] rounded px-1 py-0.5 flex-1"
              style={{ background: '#333', color: '#ddd', border: 'none' }}
            >
              {TARGET_PARAMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <button
              onClick={() => removeMapping(i)}
              className="text-[10px] text-red-400 hover:text-red-300 px-1"
            >✕</button>
          </div>

          {/* Curve */}
          <div className="flex gap-1 mb-1.5">
            {CURVES.map((c) => (
              <button
                key={c}
                onClick={() => updateMapping(i, { curve: c })}
                className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                style={{
                  background: m.curve === c ? '#555' : '#333',
                  color: m.curve === c ? '#fff' : '#666',
                }}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => updateMapping(i, { invert: !m.invert })}
              className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
              style={{
                background: m.invert ? '#6366f1' : '#333',
                color: m.invert ? '#fff' : '#666',
              }}
            >
              inv
            </button>
          </div>

          {/* Ranges */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] text-gray-500 mb-0.5">Input Range</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={m.inputRange[0]}
                  onChange={(e) => updateMapping(i, { inputRange: [parseFloat(e.target.value) || 0, m.inputRange[1]] })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
                <input
                  type="number"
                  value={m.inputRange[1]}
                  onChange={(e) => updateMapping(i, { inputRange: [m.inputRange[0], parseFloat(e.target.value) || 100] })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 mb-0.5">Output Range</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={m.outputRange[0]}
                  onChange={(e) => updateMapping(i, { outputRange: [parseFloat(e.target.value) || 0, m.outputRange[1]] })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
                <input
                  type="number"
                  value={m.outputRange[1]}
                  onChange={(e) => updateMapping(i, { outputRange: [m.outputRange[0], parseFloat(e.target.value) || 1] })}
                  className="w-full text-[10px] rounded px-1 py-0.5 font-mono"
                  style={{ background: '#333', color: '#ddd', border: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}

      {mappings.length === 0 && (
        <div className="text-[11px] text-gray-600 text-center py-2">
          No mappings. Click + Add to create one.
        </div>
      )}
    </div>
  );
}
