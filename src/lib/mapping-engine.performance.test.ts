import { describe, expect, it } from 'vitest';
import { applyMappings } from './mapping-engine';
import type { GlobalConfig, SonificationMapping } from '@/types/sonification';

const GLOBAL: GlobalConfig = {
  rootNote: 'C4',
  scale: 'major pentatonic',
  tempo: 120,
  masterVolume: 0,
};

describe('mapping-engine performance smoke', () => {
  it('handles high-frequency mapping batches within a sane budget', () => {
    const mappings: SonificationMapping[] = [
      {
        sourceField: 'a',
        targetParam: 'frequency',
        curve: 'linear',
        inputRange: [0, 100],
        outputRange: [110, 880],
        invert: false,
        smoothingMs: 50,
      },
      {
        sourceField: 'b',
        targetParam: 'velocity',
        curve: 'exponential',
        inputRange: [0, 100],
        outputRange: [0.1, 1],
        invert: false,
        quantizeStep: 0.05,
      },
      {
        sourceField: 'c',
        targetParam: 'filterCutoff',
        curve: 'logarithmic',
        inputRange: [0, 100],
        outputRange: [200, 6000],
        invert: false,
        hysteresis: 20,
      },
    ];
    const state = new Map<string, { lastOutput: number; lastUpdatedMs: number }>();
    const start = Date.now();
    for (let i = 0; i < 5000; i += 1) {
      applyMappings(
        {
          streamId: 'perf',
          timestamp: start + i * 5,
          fields: { a: i % 100, b: (i * 3) % 100, c: (i * 7) % 100 },
        },
        mappings,
        GLOBAL,
        { state, stateKeyPrefix: 'perf:test', nowMs: start + i * 5 }
      );
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
