import { describe, expect, it } from 'vitest';
import { normalizeSingleActiveChannels } from './preset-utils';
import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';
import type { ChannelConfig } from '@/types/sonification';

function channelsMap(overrides: Partial<Record<string, Partial<ChannelConfig>>> = {}): Record<string, ChannelConfig> {
  const base = Object.fromEntries(ALL_DEFAULT_CHANNELS.map((c) => [c.streamId, { ...c }]));
  for (const [id, patch] of Object.entries(overrides)) {
    base[id] = { ...base[id], ...patch };
  }
  return base;
}

describe('normalizeSingleActiveChannels', () => {
  it('keeps first enabled and disables the rest', () => {
    const input = channelsMap({
      weather: { enabled: true },
      flights: { enabled: true },
      wikipedia: { enabled: true },
    });
    const result = normalizeSingleActiveChannels(input);
    expect(result.selected).toBe('weather');
    expect(result.channels.weather.enabled).toBe(true);
    expect(result.channels.flights.enabled).toBe(false);
    expect(result.channels.wikipedia.enabled).toBe(false);
  });

  it('enables first stream when none are enabled', () => {
    const input = channelsMap({
      weather: { enabled: false },
      flights: { enabled: false },
    });
    const result = normalizeSingleActiveChannels(input);
    expect(result.selected).toBe('weather');
    expect(result.channels.weather.enabled).toBe(true);
  });
});
