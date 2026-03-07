import type { ChannelConfig } from '@/types/sonification';

export function normalizePresetChannels(channels: Record<string, ChannelConfig>): {
  channels: Record<string, ChannelConfig>;
  selected: string | null;
} {
  const entries = Object.entries(channels);
  // Pick the first enabled channel as the selected one for editing
  const selected = entries.find(([, cfg]) => cfg.enabled)?.[0]
    ?? entries[0]?.[0]
    ?? null;
  return { channels, selected };
}

/**
 * @deprecated Use normalizePresetChannels instead. Kept for test compatibility.
 */
export const normalizeSingleActiveChannels = normalizePresetChannels;
