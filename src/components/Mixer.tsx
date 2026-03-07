"use client";

import { useStore } from '@/store';
import type { AudioEngine } from '@/lib/audio-engine';
import VUMeter from './VUMeter';

const STREAM_COLORS: Record<string, string> = {
  weather: '#7C444F',
  flights: '#5C7285',
  wikipedia: '#5D8736',
};

const STREAM_LABELS: Record<string, string> = {
  weather: 'Weather',
  flights: 'Flights',
  wikipedia: 'Wikipedia',
};

export default function Mixer({ engine }: { engine: AudioEngine | null }) {
  const channels = useStore((s) => s.channels);
  const global = useStore((s) => s.global);
  const updateChannel = useStore((s) => s.updateChannel);
  const updateGlobal = useStore((s) => s.updateGlobal);
  const activeStreams = useStore((s) => s.activeStreams);

  const channelIds = Object.keys(channels);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#1a1a1a' }}>
      {/* Channel Strips */}
      <div className="flex gap-0">
        {channelIds.map((id) => {
          const config = channels[id];
          const color = STREAM_COLORS[id] ?? '#888';
          const label = STREAM_LABELS[id] ?? id;
          const status = activeStreams[id]?.status;

          return (
            <div
              key={id}
              className="flex flex-col items-center px-3 py-3 border-r border-white/5 last:border-r-0"
              style={{ minWidth: 80 }}
            >
              {/* Stream name + status */}
              <div className="text-xs font-bold mb-2 text-center" style={{ color }}>
                {label}
                {status === 'connected' && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
                {status === 'error' && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                )}
              </div>

              {/* VU Meter + Volume Fader */}
              <div className="flex items-end gap-1.5 mb-2" style={{ height: 120 }}>
                <VUMeter analyzer={engine?.getChannelAnalyzer(id) ?? null} />
                <input
                  type="range"
                  min={-40}
                  max={6}
                  step={0.5}
                  value={config.volume}
                  onChange={(e) => updateChannel(id, { volume: parseFloat(e.target.value) })}
                  className="vertical-slider"
                  style={{
                    writingMode: 'vertical-lr' as any,
                    direction: 'rtl',
                    height: 120,
                    width: 20,
                    WebkitAppearance: 'slider-vertical' as any,
                  }}
                />
              </div>

              {/* Volume readout */}
              <div className="text-[10px] text-gray-400 mb-2 font-mono">
                {config.volume > -40 ? `${config.volume.toFixed(1)}` : '-∞'} dB
              </div>

              {/* Pan knob (simple slider for now) */}
              <div className="w-full mb-2">
                <div className="text-[10px] text-gray-500 text-center mb-0.5">Pan</div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={config.pan}
                  onChange={(e) => updateChannel(id, { pan: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: color }}
                />
              </div>

              {/* Mute / Solo */}
              <div className="flex gap-1">
                <button
                  onClick={() => updateChannel(id, { mute: !config.mute })}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: config.mute ? '#ef4444' : '#333',
                    color: config.mute ? '#fff' : '#888',
                  }}
                >
                  M
                </button>
                <button
                  onClick={() => updateChannel(id, { solo: !config.solo })}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: config.solo ? '#facc15' : '#333',
                    color: config.solo ? '#000' : '#888',
                  }}
                >
                  S
                </button>
              </div>
            </div>
          );
        })}

        {/* Master Strip */}
        <div
          className="flex flex-col items-center px-3 py-3 border-l border-white/10"
          style={{ minWidth: 80, background: '#222' }}
        >
          <div className="text-xs font-bold mb-2 text-gray-300">Master</div>
          <div className="flex items-end gap-1.5 mb-2" style={{ height: 120 }}>
            <VUMeter analyzer={engine?.getMasterAnalyzer() ?? null} />
            <input
              type="range"
              min={-40}
              max={6}
              step={0.5}
              value={global.masterVolume}
              onChange={(e) => updateGlobal({ masterVolume: parseFloat(e.target.value) })}
              style={{
                writingMode: 'vertical-lr' as any,
                direction: 'rtl',
                height: 120,
                width: 20,
                WebkitAppearance: 'slider-vertical' as any,
              }}
            />
          </div>
          <div className="text-[10px] text-gray-400 mb-2 font-mono">
            {global.masterVolume > -40 ? `${global.masterVolume.toFixed(1)}` : '-∞'} dB
          </div>

          {/* Tempo */}
          <div className="w-full mt-1">
            <div className="text-[10px] text-gray-500 text-center mb-0.5">BPM</div>
            <input
              type="number"
              min={40}
              max={240}
              value={global.tempo}
              onChange={(e) => updateGlobal({ tempo: parseInt(e.target.value) || 120 })}
              className="w-full text-xs text-center rounded px-1 py-0.5"
              style={{ background: '#333', color: '#ddd', border: 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
