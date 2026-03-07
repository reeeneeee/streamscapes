"use client";

import { useStore } from '@/store';
import type { StreamPlugin } from '@/types/stream';

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
  const updateChannel = useStore((s) => s.updateChannel);
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
            const enabled = config?.enabled ?? false;
            const status = activeStreams[plugin.id]?.status;
            const color = STREAM_COLORS[plugin.id] ?? '#888';

            return (
              <button
                key={plugin.id}
                onClick={() => updateChannel(plugin.id, { enabled: !enabled })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm mb-0.5 transition-colors"
                style={{
                  background: enabled ? `${color}22` : 'transparent',
                  color: enabled ? '#eee' : '#666',
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
                <span className="flex-1 truncate">{plugin.name}</span>
                <span className="text-[10px] text-gray-500">
                  {enabled ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
