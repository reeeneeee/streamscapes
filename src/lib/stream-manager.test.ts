import { describe, it, expect, vi } from 'vitest';
import { StreamManager } from './stream-manager';
import type { AudioEngine } from './audio-engine';
import type { StreamPlugin, DataPoint } from '@/types/stream';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDataPoint(streamId: string, value: number): DataPoint {
  return {
    streamId,
    timestamp: Date.now(),
    fields: { value },
  };
}

describe('StreamManager', () => {
  it('connects a stream, forwards datapoints, and disconnects cleanly', async () => {
    const setStreamState = vi.fn();
    const handleDataPoint = vi.fn();

    const plugin: StreamPlugin = {
      id: 'demo',
      name: 'Demo',
      description: 'demo stream',
      category: 'information',
      async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
        yield makeDataPoint('demo', 1);
        while (!signal.aborted) {
          await wait(5);
        }
      },
    };

    const manager = new StreamManager(
      { setStreamState },
      { handleDataPoint } as unknown as AudioEngine,
      [plugin]
    );

    const run = manager.connectStream('demo');
    await wait(15);
    manager.disconnectStream('demo');
    await run;

    expect(setStreamState).toHaveBeenCalledWith('demo', { status: 'connecting' });
    expect(setStreamState).toHaveBeenCalledWith('demo', { status: 'connected' });
    expect(handleDataPoint).toHaveBeenCalledWith(expect.objectContaining({ streamId: 'demo' }));
    expect(setStreamState).toHaveBeenCalledWith('demo', null);
  });

  it('is idempotent when connectStream is called twice', async () => {
    const setStreamState = vi.fn();
    const handleDataPoint = vi.fn();
    const connectSpy = vi.fn();

    const plugin: StreamPlugin = {
      id: 'demo',
      name: 'Demo',
      description: 'demo stream',
      category: 'information',
      async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
        connectSpy();
        while (!signal.aborted) {
          await wait(5);
        }
      },
    };

    const manager = new StreamManager(
      { setStreamState },
      { handleDataPoint } as unknown as AudioEngine,
      [plugin]
    );

    const a = manager.connectStream('demo');
    const b = manager.connectStream('demo');
    await wait(15);
    manager.disconnectStream('demo');
    await Promise.all([a, b]);

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('sets error state when a stream throws', async () => {
    const setStreamState = vi.fn();
    const handleDataPoint = vi.fn();

    const plugin: StreamPlugin = {
      id: 'bad',
      name: 'Bad',
      description: 'throws',
      category: 'information',
      async *connect(): AsyncIterable<DataPoint> {
        throw new Error('boom');
      },
    };

    const manager = new StreamManager(
      { setStreamState },
      { handleDataPoint } as unknown as AudioEngine,
      [plugin]
    );

    await manager.connectStream('bad');

    expect(setStreamState).toHaveBeenCalledWith('bad', { status: 'connecting' });
    expect(setStreamState).toHaveBeenCalledWith('bad', { status: 'connected' });
    expect(setStreamState).toHaveBeenCalledWith('bad', { status: 'error', error: 'boom' });
  });

  it('dispose disconnects all active streams', async () => {
    const setStreamState = vi.fn();
    const handleDataPoint = vi.fn();

    const pluginA: StreamPlugin = {
      id: 'a',
      name: 'A',
      description: 'a',
      category: 'information',
      async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
        while (!signal.aborted) {
          await wait(5);
        }
      },
    };
    const pluginB: StreamPlugin = {
      id: 'b',
      name: 'B',
      description: 'b',
      category: 'financial',
      async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
        while (!signal.aborted) {
          await wait(5);
        }
      },
    };

    const manager = new StreamManager(
      { setStreamState },
      { handleDataPoint } as unknown as AudioEngine,
      [pluginA, pluginB]
    );

    const runA = manager.connectStream('a');
    const runB = manager.connectStream('b');
    await wait(15);
    manager.dispose();
    await Promise.all([runA, runB]);

    expect(setStreamState).toHaveBeenCalledWith('a', null);
    expect(setStreamState).toHaveBeenCalledWith('b', null);
  });
});
