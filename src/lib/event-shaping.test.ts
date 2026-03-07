import { describe, expect, it } from 'vitest';
import {
  articulationDuration,
  articulationVelocity,
  eventMetricFromParams,
  nextBurstHistory,
  passesCooldown,
  passesThreshold,
} from './event-shaping';

describe('event-shaping', () => {
  it('derives event metric from velocity/scale/frequency', () => {
    expect(eventMetricFromParams({ velocity: 0.4 })).toBeCloseTo(0.4);
    expect(eventMetricFromParams({ scaleIndex: 6 })).toBeCloseTo(0.5);
    const freqMetric = eventMetricFromParams({ frequency: 440 });
    expect(freqMetric).toBeGreaterThan(0.4);
    expect(freqMetric).toBeLessThan(0.8);
  });

  it('applies threshold deltas correctly', () => {
    expect(passesThreshold(undefined, 0.2, 0.1)).toBe(true);
    expect(passesThreshold(0.2, 0.25, 0.1)).toBe(false);
    expect(passesThreshold(0.2, 0.35, 0.1)).toBe(true);
  });

  it('enforces cooldown windows', () => {
    expect(passesCooldown(1000, 950, 100)).toBe(false);
    expect(passesCooldown(1000, 850, 100)).toBe(true);
    expect(passesCooldown(1000, undefined, 100)).toBe(true);
  });

  it('enforces burst cap and prunes old events', () => {
    const h0 = nextBurstHistory(1000, [], 2, 300);
    expect(h0.allowed).toBe(true);
    const h1 = nextBurstHistory(1100, h0.history, 2, 300);
    expect(h1.allowed).toBe(true);
    const h2 = nextBurstHistory(1200, h1.history, 2, 300);
    expect(h2.allowed).toBe(false);
    const h3 = nextBurstHistory(1500, h2.history, 2, 300);
    expect(h3.allowed).toBe(true);
  });

  it('maps articulation to duration and velocity factors', () => {
    expect(articulationDuration('soft')).toBe('4n');
    expect(articulationDuration('neutral')).toBe('8n');
    expect(articulationDuration('punchy')).toBe('16n');
    expect(articulationVelocity(0.5, 'soft')).toBeCloseTo(0.375);
    expect(articulationVelocity(0.5, 'neutral')).toBeCloseTo(0.5);
    expect(articulationVelocity(0.5, 'punchy')).toBeCloseTo(0.6);
  });
});
