import type { ChannelConfig } from '@/types/sonification';

const STREAM_PRIORITY = ['weather', 'flights', 'wikipedia', 'rss', 'stocks'] as const;

export function normalizePresetChannels(channels: Record<string, ChannelConfig>): {
  channels: Record<string, ChannelConfig>;
  selected: string | null;
} {
  const entries = Object.entries(channels);
  const enabled = new Set(entries.filter(([, cfg]) => cfg.enabled).map(([id]) => id));
  const orderedIds = [
    ...STREAM_PRIORITY.filter((id) => channels[id]),
    ...Object.keys(channels).filter((id) => !STREAM_PRIORITY.includes(id as (typeof STREAM_PRIORITY)[number])),
  ];
  const selected = orderedIds.find((id) => enabled.has(id))
    ?? orderedIds[0]
    ?? null;
  return { channels, selected };
}

/**
 * @deprecated Use normalizePresetChannels instead. Kept for test compatibility.
 */
export const normalizeSingleActiveChannels = normalizePresetChannels;
