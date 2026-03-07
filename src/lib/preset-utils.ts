import type { ChannelConfig } from '@/types/sonification';

export function normalizeSingleActiveChannels(channels: Record<string, ChannelConfig>): {
  channels: Record<string, ChannelConfig>;
  selected: string | null;
} {
  const entries = Object.entries(channels);
  let selected: string | null = null;
  const normalized: Record<string, ChannelConfig> = {};
  for (const [id, cfg] of entries) {
    const next = { ...cfg };
    if (cfg.enabled && selected === null) {
      selected = id;
      next.enabled = true;
    } else {
      next.enabled = false;
    }
    normalized[id] = next;
  }
  if (!selected && entries.length > 0) {
    const [firstId] = entries[0];
    normalized[firstId] = { ...normalized[firstId], enabled: true };
    selected = firstId;
  }
  return { channels: normalized, selected };
}
