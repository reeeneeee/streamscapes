import { describe, it, expect } from 'vitest';
import { applyMappings } from './mapping-engine';
import type { DataPoint } from '@/types/stream';
import type { SonificationMapping, GlobalConfig } from '@/types/sonification';

const GLOBAL: GlobalConfig = {
  rootNote: 'C4',
  scale: 'major pentatonic',
  tempo: 120,
  masterVolume: 0,
};

function makeDataPoint(fields: Record<string, number | string | boolean>): DataPoint {
  return { streamId: 'test', timestamp: Date.now(), fields };
}

function makeMapping(overrides: Partial<SonificationMapping> = {}): SonificationMapping {
  return {
    sourceField: 'value',
    targetParam: 'frequency',
    curve: 'linear',
    inputRange: [0, 100],
    outputRange: [0, 1],
    invert: false,
    ...overrides,
  };
}

describe('applyMappings', () => {
  // --- Linear curve ---
  describe('linear curve', () => {
    it('maps midpoint correctly', () => {
      const result = applyMappings(makeDataPoint({ value: 50 }), [makeMapping()], GLOBAL);
      expect(result.frequency).toBeCloseTo(0.5);
    });

    it('maps minimum to output min', () => {
      const result = applyMappings(makeDataPoint({ value: 0 }), [makeMapping()], GLOBAL);
      expect(result.frequency).toBeCloseTo(0);
    });

    it('maps maximum to output max', () => {
      const result = applyMappings(makeDataPoint({ value: 100 }), [makeMapping()], GLOBAL);
      expect(result.frequency).toBeCloseTo(1);
    });

    it('clamps values below input min', () => {
      const result = applyMappings(makeDataPoint({ value: -50 }), [makeMapping()], GLOBAL);
      expect(result.frequency).toBeCloseTo(0);
    });

    it('clamps values above input max', () => {
      const result = applyMappings(makeDataPoint({ value: 200 }), [makeMapping()], GLOBAL);
      expect(result.frequency).toBeCloseTo(1);
    });

    it('handles custom output range', () => {
      const mapping = makeMapping({ outputRange: [100, 500] });
      const result = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(300);
    });
  });

  // --- Logarithmic curve ---
  describe('logarithmic curve', () => {
    it('maps midpoint (should be higher than linear due to log compression)', () => {
      const mapping = makeMapping({ curve: 'logarithmic' });
      const result = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL);
      expect(result.frequency).toBeGreaterThan(0.5);
      expect(result.frequency).toBeLessThan(1);
    });

    it('maps 0 to output min', () => {
      const mapping = makeMapping({ curve: 'logarithmic' });
      const result = applyMappings(makeDataPoint({ value: 0 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0);
    });

    it('maps max to output max', () => {
      const mapping = makeMapping({ curve: 'logarithmic' });
      const result = applyMappings(makeDataPoint({ value: 100 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(1);
    });
  });

  // --- Exponential curve ---
  describe('exponential curve', () => {
    it('maps midpoint (should be lower than linear due to squaring)', () => {
      const mapping = makeMapping({ curve: 'exponential' });
      const result = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0.25);
    });

    it('maps 0 to output min', () => {
      const mapping = makeMapping({ curve: 'exponential' });
      const result = applyMappings(makeDataPoint({ value: 0 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0);
    });

    it('maps max to output max', () => {
      const mapping = makeMapping({ curve: 'exponential' });
      const result = applyMappings(makeDataPoint({ value: 100 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(1);
    });
  });

  // --- Step curve ---
  describe('step curve', () => {
    it('quantizes to 5 discrete steps', () => {
      const mapping = makeMapping({ curve: 'step' });
      // 0-12.5% → 0, 12.5-37.5% → 0.25, 37.5-62.5% → 0.5, etc.
      const r10 = applyMappings(makeDataPoint({ value: 10 }), [mapping], GLOBAL);
      const r30 = applyMappings(makeDataPoint({ value: 30 }), [mapping], GLOBAL);
      const r50 = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL);
      const r70 = applyMappings(makeDataPoint({ value: 70 }), [mapping], GLOBAL);
      const r90 = applyMappings(makeDataPoint({ value: 90 }), [mapping], GLOBAL);

      expect(r10.frequency).toBeCloseTo(0);
      expect(r30.frequency).toBeCloseTo(0.25);
      expect(r50.frequency).toBeCloseTo(0.5);
      expect(r70.frequency).toBeCloseTo(0.75);
      expect(r90.frequency).toBeCloseTo(1);
    });
  });

  // --- Invert ---
  describe('invert', () => {
    it('inverts the mapping', () => {
      const mapping = makeMapping({ invert: true });
      const result = applyMappings(makeDataPoint({ value: 25 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0.75);
    });

    it('inverted 0 maps to output max', () => {
      const mapping = makeMapping({ invert: true });
      const result = applyMappings(makeDataPoint({ value: 0 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(1);
    });
  });

  // --- Multiple mappings ---
  describe('multiple mappings', () => {
    it('applies all mappings and returns all params', () => {
      const mappings = [
        makeMapping({ sourceField: 'temp', targetParam: 'frequency', outputRange: [200, 800] }),
        makeMapping({ sourceField: 'humidity', targetParam: 'velocity', outputRange: [0, 1] }),
      ];
      const result = applyMappings(
        makeDataPoint({ temp: 50, humidity: 80 }),
        mappings,
        GLOBAL
      );
      expect(result.frequency).toBeCloseTo(500);
      expect(result.velocity).toBeCloseTo(0.8);
    });
  });

  // --- Row controls ---
  describe('row-level controls', () => {
    it('applies output quantization', () => {
      const mapping = makeMapping({ quantizeStep: 0.2 });
      const result = applyMappings(makeDataPoint({ value: 63 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0.6);
    });

    it('applies hysteresis deadband with state', () => {
      const mapping = makeMapping({ hysteresis: 0.2 });
      const state = new Map<string, { lastOutput: number; lastUpdatedMs: number }>();
      const r1 = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL, { state, nowMs: 0 });
      const r2 = applyMappings(makeDataPoint({ value: 60 }), [mapping], GLOBAL, { state, nowMs: 100 });
      const r3 = applyMappings(makeDataPoint({ value: 80 }), [mapping], GLOBAL, { state, nowMs: 200 });
      expect(r1.frequency).toBeCloseTo(0.5);
      expect(r2.frequency).toBeCloseTo(0.5);
      expect(r3.frequency).toBeCloseTo(0.8);
    });

    it('applies smoothing over time with state', () => {
      const mapping = makeMapping({ smoothingMs: 1000 });
      const state = new Map<string, { lastOutput: number; lastUpdatedMs: number }>();
      const r1 = applyMappings(makeDataPoint({ value: 0 }), [mapping], GLOBAL, { state, nowMs: 0 });
      const r2 = applyMappings(makeDataPoint({ value: 100 }), [mapping], GLOBAL, { state, nowMs: 250 });
      const r3 = applyMappings(makeDataPoint({ value: 100 }), [mapping], GLOBAL, { state, nowMs: 1000 });
      expect(r1.frequency).toBeCloseTo(0);
      expect(r2.frequency).toBeCloseTo(0.25);
      expect(r3.frequency).toBeGreaterThan(r2.frequency ?? 0);
      expect(r3.frequency).toBeLessThanOrEqual(1);
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('skips non-numeric fields', () => {
      const result = applyMappings(
        makeDataPoint({ value: 'hello' }),
        [makeMapping()],
        GLOBAL
      );
      expect(result.frequency).toBeUndefined();
    });

    it('skips boolean fields', () => {
      const result = applyMappings(
        makeDataPoint({ value: true }),
        [makeMapping()],
        GLOBAL
      );
      expect(result.frequency).toBeUndefined();
    });

    it('skips missing fields', () => {
      const result = applyMappings(
        makeDataPoint({ other: 42 }),
        [makeMapping()],
        GLOBAL
      );
      expect(result.frequency).toBeUndefined();
    });

    it('returns empty object for no mappings', () => {
      const result = applyMappings(makeDataPoint({ value: 50 }), [], GLOBAL);
      expect(result).toEqual({});
    });

    it('handles equal input range without NaN', () => {
      const mapping = makeMapping({ inputRange: [50, 50] });
      const result = applyMappings(makeDataPoint({ value: 50 }), [mapping], GLOBAL);
      expect(result.frequency).toBeCloseTo(0);
    });
  });
});
