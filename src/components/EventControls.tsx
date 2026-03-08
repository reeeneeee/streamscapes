"use client";

import type { ChannelConfig, EventArticulation } from '@/types/sonification';

const EVENT_ARTICULATIONS: { value: EventArticulation; label: string; description: string }[] = [
  { value: 'soft', label: 'Soft', description: 'Longer, gentler notes for less intrusive monitoring.' },
  { value: 'neutral', label: 'Neutral', description: 'Balanced note length and intensity.' },
  { value: 'punchy', label: 'Punchy', description: 'Short, bright accents that cut through the mix.' },
];

export default function EventControls({
  config,
  onUpdate,
  showDescription = true,
}: {
  config: ChannelConfig;
  onUpdate: (partial: Partial<ChannelConfig>) => void;
  showDescription?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">Event Cooldown</span>
        <span className="text-[10px] text-gray-400 font-mono">{config.eventCooldownMs ?? 150}ms</span>
      </div>
      <input
        type="range"
        min={0}
        max={1500}
        step={25}
        value={config.eventCooldownMs ?? 150}
        onChange={(e) => onUpdate({ eventCooldownMs: parseInt(e.target.value, 10) })}
        className="w-full h-1 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: '#888' }}
      />
      <div>
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-500">Trigger Threshold</span>
          <span className="text-[10px] text-gray-400 font-mono">{(config.eventTriggerThreshold ?? 0).toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={config.eventTriggerThreshold ?? 0}
          onChange={(e) => onUpdate({ eventTriggerThreshold: parseFloat(e.target.value) })}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: '#888' }}
        />
      </div>
      <div>
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-500">Burst Cap</span>
          <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstCap ?? 0}</span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={config.eventBurstCap ?? 0}
          onChange={(e) => onUpdate({ eventBurstCap: parseInt(e.target.value, 10) })}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: '#888' }}
        />
      </div>
      <div>
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-500">Burst Window</span>
          <span className="text-[10px] text-gray-400 font-mono">{config.eventBurstWindowMs ?? 1200}ms</span>
        </div>
        <input
          type="range"
          min={200}
          max={5000}
          step={50}
          value={config.eventBurstWindowMs ?? 1200}
          onChange={(e) => onUpdate({ eventBurstWindowMs: parseInt(e.target.value, 10) })}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: '#888' }}
        />
      </div>
      <div>
        <div className="text-[10px] text-gray-500 mb-1">Articulation</div>
        <div className="grid grid-cols-3 gap-1">
          {EVENT_ARTICULATIONS.map((a) => (
            <button
              key={a.value}
              onClick={() => onUpdate({ eventArticulation: a.value })}
              className="text-[10px] px-1.5 py-1 rounded transition-colors"
              style={{
                background: (config.eventArticulation ?? 'neutral') === a.value ? '#555' : '#333',
                color: (config.eventArticulation ?? 'neutral') === a.value ? '#fff' : '#888',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {showDescription && (
          <div className="text-[10px] text-gray-500 mt-1">
            {EVENT_ARTICULATIONS.find((a) => a.value === (config.eventArticulation ?? 'neutral'))?.description}
          </div>
        )}
      </div>
    </div>
  );
}
