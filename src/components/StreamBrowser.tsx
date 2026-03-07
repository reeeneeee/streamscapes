"use client";

import { useStore } from '@/store';
import type { StreamPlugin } from '@/types/stream';
import { genericChannelPatch } from '@/lib/generic-settings';

const STREAM_COLORS: Record<string, string> = {
  weather: '#7C444F',
  flights: '#5C7285',
  wikipedia: '#5D8736',
  rss: '#B8860B',
  stocks: '#E6A817',
};

const CATEGORY_LABELS: Record<string, string> = {
  environment: 'Environment',
  information: 'Information',
  financial: 'Financial',
  social: 'Social',
};

export default function StreamBrowser({ plugins }: { plugins: StreamPlugin[] }) {
  const channels = useStore((s) => s.channels);
  const selectedChannelId = useStore((s) => s.selectedChannelId);
  const updateChannel = useStore((s) => s.updateChannel);
  const setSelectedChannel = useStore((s) => s.setSelectedChannel);
  const activeStreams = useStore((s) => s.activeStreams);

  // Group by category
  const grouped = plugins.reduce<Record<string, StreamPlugin[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="panel">
      <div className="panel-title">Streams</div>
      {Object.entries(grouped).map(([category, streams]) => (
        <div key={category} className="mb-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          {streams.map((plugin) => {
            const config = channels[plugin.id];
            if (!config) return null;
            const enabled = config?.enabled ?? false;
            const status = activeStreams[plugin.id]?.status;
            const color = STREAM_COLORS[plugin.id] ?? '#888';

            return (
              <div
                key={plugin.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm mb-0.5 transition-colors"
                style={{
                  background: selectedChannelId === plugin.id ? `${color}22` : 'transparent',
                  color: selectedChannelId === plugin.id ? '#eee' : '#666',
                }}
              >
                {/* Status dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: status === 'connected' ? '#4ade80'
                      : status === 'connecting' ? '#facc15'
                      : status === 'error' ? '#ef4444'
                      : enabled ? color : '#444',
                  }}
                />
                <button
                  onClick={() => setSelectedChannel(plugin.id)}
                  className="flex-1 truncate text-left hover:text-white"
                >
                  {plugin.name}
                </button>
                <span className="text-[10px] text-gray-500">
                  {selectedChannelId === plugin.id ? 'WORKING' : enabled ? 'HEARD' : 'OFF'}
                </span>
                <button
                  onClick={() => updateChannel(plugin.id, genericChannelPatch(plugin.id, config))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-gray-300 hover:text-white"
                  title="Choose Generic Setting"
                >
                  Generic
                </button>
                <button
                  onClick={() => updateChannel(plugin.id, { enabled: !enabled })}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: enabled ? '#4ade80' : '#333',
                    color: enabled ? '#000' : '#999',
                  }}
                >
                  Hear
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
