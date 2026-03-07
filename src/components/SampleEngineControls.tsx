"use client";

import type { ChannelConfig } from '@/types/sonification';

const SAMPLE_SOURCES: { value: string; label: string }[] = [
  { value: 'rain', label: 'Rain Texture' },
  { value: 'wind', label: 'Wind Bed' },
  { value: 'vinyl', label: 'Vinyl Dust' },
  { value: 'chimes', label: 'Soft Chimes' },
];

export default function SampleEngineControls({
  config,
  onUpdate,
}: {
  config: ChannelConfig;
  onUpdate: (partial: Partial<ChannelConfig>) => void;
}) {
  return (
    <div className="space-y-1.5 p-1.5 rounded" style={{ background: '#2b2b2b' }}>
      <div className="text-[10px] text-gray-400">Sample Engine</div>
      <div className="grid grid-cols-2 gap-1">
        {SAMPLE_SOURCES.map((src) => (
          <button
            key={src.value}
            onClick={() => onUpdate({ sampleSource: src.value })}
            className="text-[10px] px-1.5 py-1 rounded transition-colors"
            style={{
              background: (config.sampleSource ?? 'rain') === src.value ? '#556' : '#333',
              color: (config.sampleSource ?? 'rain') === src.value ? '#fff' : '#888',
            }}
          >
            {src.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Rate Min</span>
            <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMin ?? 0.8).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.01}
            value={config.samplePlaybackRateMin ?? 0.8}
            onChange={(e) => onUpdate({ samplePlaybackRateMin: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#6b7280' }}
          />
        </div>
        <div>
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Rate Max</span>
            <span className="text-[10px] text-gray-400 font-mono">{(config.samplePlaybackRateMax ?? 1.2).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={2.5}
            step={0.01}
            value={config.samplePlaybackRateMax ?? 1.2}
            onChange={(e) => onUpdate({ samplePlaybackRateMax: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#6b7280' }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-500">Density</span>
          <span className="text-[10px] text-gray-400 font-mono">{(config.sampleDensity ?? 1.2).toFixed(1)} Hz</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={8}
          step={0.1}
          value={config.sampleDensity ?? 1.2}
          onChange={(e) => onUpdate({ sampleDensity: parseFloat(e.target.value) })}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: '#6b7280' }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Filter</span>
            <span className="text-[10px] text-gray-400 font-mono">{Math.round(config.sampleFilterCutoff ?? 2200)}Hz</span>
          </div>
          <input
            type="range"
            min={200}
            max={10000}
            step={50}
            value={config.sampleFilterCutoff ?? 2200}
            onChange={(e) => onUpdate({ sampleFilterCutoff: parseInt(e.target.value, 10) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#6b7280' }}
          />
        </div>
        <div>
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-500">Reverb Send</span>
            <span className="text-[10px] text-gray-400 font-mono">{Math.round((config.sampleReverbSend ?? 0.25) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={config.sampleReverbSend ?? 0.25}
            onChange={(e) => onUpdate({ sampleReverbSend: parseFloat(e.target.value) })}
            className="w-full h-1 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#6b7280' }}
          />
        </div>
      </div>
    </div>
  );
}
