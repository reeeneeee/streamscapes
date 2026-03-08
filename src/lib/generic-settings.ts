import { ALL_DEFAULT_CHANNELS } from '@/streams/defaults';
import type { ChannelConfig } from '@/types/sonification';

const DEFAULT_BY_STREAM: Record<string, ChannelConfig> = Object.fromEntries(
  ALL_DEFAULT_CHANNELS.map((cfg) => [cfg.streamId, cfg])
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function genericChannelPatch(streamId: string, current: ChannelConfig): Partial<ChannelConfig> {
  const base = DEFAULT_BY_STREAM[streamId] ?? current;
  const next = clone(base);
  return {
    ...next,
    enabled: current.enabled,
    streamId: current.streamId,
  };
}
