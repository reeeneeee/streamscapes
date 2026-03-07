"use client";

import { useStore } from '@/store';
import { STREAM_COLORS } from '@/lib/stream-constants';
import type { StreamPlugin } from '@/types/stream';
import { genericChannelPatch } from '@/lib/generic-settings';

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

  const cycleState = (id: string) => {
    const config = channels[id];
    if (!config) return;
    if (config.solo) {
      // solo → off
      updateChannel(id, { enabled: false, solo: false });
    } else if (config.enabled) {
      // active → solo
      updateChannel(id, { solo: true, mute: false });
    } else {
      // off → active
      updateChannel(id, { enabled: true, solo: false, mute: false });
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Streams</div>
      <div className="text-[9px] text-gray-500 -mt-1 mb-2">
        Activate streams to listen. Solo a stream to hear it alone.
      </div>
      {Object.entries(grouped).map(([category, streams]) => (
        <div key={category} className="mb-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          {streams.map((plugin) => {
            const config = channels[plugin.id];
            if (!config) return null;
            const isActive = config.enabled;
            const isSolo = config.solo;
            const isSelected = selectedChannelId === plugin.id;
            const status = activeStreams[plugin.id]?.status;
            const color = STREAM_COLORS[plugin.id] ?? '#888';

            const stateLabel = isSolo ? 'SOLO' : isActive ? 'ACTIVE' : '';
            const btnLabel = isSolo ? 'Solo' : isActive ? 'Active' : 'Off';
            const btnBg = isSolo ? '#facc15' : isActive ? '#4ade80' : '#333';
            const btnColor = isSolo ? '#000' : isActive ? '#000' : '#999';

            return (
              <div
                key={plugin.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm mb-0.5 transition-colors"
                style={{
                  background: isSelected ? `${color}22` : 'transparent',
                  color: isSelected ? '#eee' : '#666',
                }}
              >
                {/* Status dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: status === 'connected' ? '#4ade80'
                      : status === 'connecting' ? '#facc15'
                      : status === 'error' ? '#ef4444'
                      : isActive ? color : '#444',
                  }}
                />
                <button
                  onClick={() => setSelectedChannel(plugin.id)}
                  className="flex-1 truncate text-left hover:text-white"
                >
                  {plugin.name}
                </button>
                <span className="text-[10px] text-gray-500 w-12 text-right">
                  {isSelected ? 'EDITING' : stateLabel}
                </span>
                <button
                  onClick={() => updateChannel(plugin.id, genericChannelPatch(plugin.id, config))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-gray-300 hover:text-white"
                  title="Reset to default settings"
                >
                  Reset
                </button>
                <button
                  onClick={() => cycleState(plugin.id)}
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors min-w-[44px] text-center"
                  title={
                    isSolo ? 'Click to deactivate'
                    : isActive ? 'Click to solo'
                    : 'Click to activate'
                  }
                  style={{ background: btnBg, color: btnColor }}
                >
                  {btnLabel}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
