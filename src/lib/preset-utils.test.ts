import { describe, expect, it } from 'vitest';
import { normalizePresetChannels } from './preset-utils';
import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';
import type { ChannelConfig } from '@/types/sonification';

function channelsMap(overrides: Partial<Record<string, Partial<ChannelConfig>>> = {}): Record<string, ChannelConfig> {
  const base = Object.fromEntries(ALL_DEFAULT_CHANNELS.map((c) => [c.streamId, { ...c }]));
  for (const [id, patch] of Object.entries(overrides)) {
    base[id] = { ...base[id], ...patch };
  }
  return base;
}

describe('normalizePresetChannels', () => {
  it('preserves all enabled channels', () => {
    const input = channelsMap({
      weather: { enabled: true },
      flights: { enabled: true },
      wikipedia: { enabled: true },
    });
    const result = normalizePresetChannels(input);
    expect(result.selected).toBe('weather');
    expect(result.channels.weather.enabled).toBe(true);
    expect(result.channels.flights.enabled).toBe(true);
    expect(result.channels.wikipedia.enabled).toBe(true);
  });

  it('selects first entry when none are enabled', () => {
    const input = channelsMap({
      weather: { enabled: false },
      flights: { enabled: false },
      wikipedia: { enabled: false },
      rss: { enabled: false },
      stocks: { enabled: false },
    });
    const result = normalizePresetChannels(input);
    expect(result.selected).toBe('weather');
    expect(result.channels.weather.enabled).toBe(false);
  });
});
