import { describe, it, expect, vi } from 'vitest';
import { ingestBus, type SpanMessage } from '../ingest-bus';

const makeMsg = (overrides: Partial<SpanMessage> = {}): SpanMessage => ({
  serviceName: 'test-svc',
  spanName: 'GET /test',
  durationMs: 100,
  statusCode: 1,
  kind: 2,
  timestamp: Date.now(),
  ...overrides,
});

describe('IngestBus', () => {
  it('publishes messages to subscribers', () => {
    const listener = vi.fn();
    const unsub = ingestBus.subscribe(listener);

    const msg = makeMsg();
    ingestBus.publish(msg);

    expect(listener).toHaveBeenCalledWith(msg);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('unsubscribe stops delivery', () => {
    const listener = vi.fn();
    const unsub = ingestBus.subscribe(listener);

    unsub();
    ingestBus.publish(makeMsg());

    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks subscriber count', () => {
    const initial = ingestBus.subscriberCount;

    const unsub1 = ingestBus.subscribe(() => {});
    expect(ingestBus.subscriberCount).toBe(initial + 1);

    const unsub2 = ingestBus.subscribe(() => {});
    expect(ingestBus.subscriberCount).toBe(initial + 2);

    unsub1();
    expect(ingestBus.subscriberCount).toBe(initial + 1);

    unsub2();
    expect(ingestBus.subscriberCount).toBe(initial);
  });

  it('supports multiple subscribers', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const u1 = ingestBus.subscribe(l1);
    const u2 = ingestBus.subscribe(l2);

    const msg = makeMsg();
    ingestBus.publish(msg);

    expect(l1).toHaveBeenCalledWith(msg);
    expect(l2).toHaveBeenCalledWith(msg);
    u1();
    u2();
  });
});
