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

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('IngestBus (per-user)', () => {
  it('publishes messages to user subscribers', () => {
    const listener = vi.fn();
    const unsub = ingestBus.subscribeToUser(USER_A, listener);

    const msg = makeMsg();
    ingestBus.publishToUser(USER_A, msg);

    expect(listener).toHaveBeenCalledWith(msg);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('unsubscribe stops delivery', () => {
    const listener = vi.fn();
    const unsub = ingestBus.subscribeToUser(USER_A, listener);

    unsub();
    ingestBus.publishToUser(USER_A, makeMsg());

    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates messages between users', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = ingestBus.subscribeToUser(USER_A, listenerA);
    const unsubB = ingestBus.subscribeToUser(USER_B, listenerB);

    const msg = makeMsg();
    ingestBus.publishToUser(USER_A, msg);

    expect(listenerA).toHaveBeenCalledWith(msg);
    expect(listenerB).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it('tracks per-user subscriber count', () => {
    const unsub1 = ingestBus.subscribeToUser(USER_A, () => {});
    expect(ingestBus.subscriberCountForUser(USER_A)).toBe(1);
    expect(ingestBus.subscriberCountForUser(USER_B)).toBe(0);

    const unsub2 = ingestBus.subscribeToUser(USER_A, () => {});
    expect(ingestBus.subscriberCountForUser(USER_A)).toBe(2);

    unsub1();
    expect(ingestBus.subscriberCountForUser(USER_A)).toBe(1);

    unsub2();
    expect(ingestBus.subscriberCountForUser(USER_A)).toBe(0);
  });

  it('cleans up empty channel sets', () => {
    const unsub = ingestBus.subscribeToUser('temp-user', () => {});
    expect(ingestBus.subscriberCountForUser('temp-user')).toBe(1);

    unsub();
    // After unsubscribe, publishing to this user should be a no-op (no error)
    ingestBus.publishToUser('temp-user', makeMsg());
    expect(ingestBus.subscriberCountForUser('temp-user')).toBe(0);
  });
});
