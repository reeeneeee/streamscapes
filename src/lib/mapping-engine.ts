import type { DataPoint } from '@/types/stream';
import type { SonificationMapping, GlobalConfig } from '@/types/sonification';

export interface MappingStateEntry {
  lastOutput: number;
  lastUpdatedMs: number;
}

export type MappingState = Map<string, MappingStateEntry>;

export interface ApplyMappingsOptions {
  state?: MappingState;
  stateKeyPrefix?: string;
  nowMs?: number;
}

function applyCurve(
  value: number,
  curve: SonificationMapping['curve'],
  inputRange: [number, number],
  outputRange: [number, number],
  invert: boolean
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

  if (inMax === inMin) {
    return outMin;
  }

  // Normalize to 0-1
  let normalized = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));

  if (invert) normalized = 1 - normalized;

  // Apply curve
  switch (curve) {
    case 'logarithmic':
      normalized = Math.log1p(normalized * 9) / Math.log(10); // log scale 0-1
      break;
    case 'exponential':
      normalized = Math.pow(normalized, 2);
      break;
    case 'step':
      normalized = Math.round(normalized * 4) / 4; // 5 steps
      break;
    case 'linear':
    default:
      break;
  }

  // Map to output range
  return outMin + normalized * (outMax - outMin);
}

function mappingStateKey(prefix: string, index: number, mapping: SonificationMapping): string {
  return `${prefix}:${index}:${mapping.sourceField}->${mapping.targetParam}`;
}

export function clearMappingStateForPrefix(state: MappingState, prefix: string): void {
  for (const key of state.keys()) {
    if (key.startsWith(prefix)) {
      state.delete(key);
    }
  }
}

export function applyMappings(
  dataPoint: DataPoint,
  mappings: readonly SonificationMapping[],
  _globalConfig: GlobalConfig,
  options?: ApplyMappingsOptions
): Partial<Record<string, number>> {
  const result: Partial<Record<string, number>> = {};
  const nowMs = options?.nowMs ?? Date.now();
  const state = options?.state;
  const prefix = options?.stateKeyPrefix ?? dataPoint.streamId;

  for (let index = 0; index < mappings.length; index += 1) {
    const mapping = mappings[index];
    const rawValue = dataPoint.fields[mapping.sourceField];

    // Only map numeric fields
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;

    let mapped = applyCurve(
      rawValue,
      mapping.curve,
      mapping.inputRange,
      mapping.outputRange,
      mapping.invert
    );

    if (state) {
      const key = mappingStateKey(prefix, index, mapping);
      const prev = state.get(key);

      const hysteresis = Math.max(0, mapping.hysteresis ?? 0);
      if (hysteresis > 0 && prev && Math.abs(mapped - prev.lastOutput) < hysteresis) {
        mapped = prev.lastOutput;
      }

      const smoothingMs = Math.max(0, mapping.smoothingMs ?? 0);
      if (smoothingMs > 0 && prev) {
        const dt = Math.max(1, nowMs - prev.lastUpdatedMs);
        const alpha = Math.min(1, dt / smoothingMs);
        mapped = prev.lastOutput + (mapped - prev.lastOutput) * alpha;
      }

      const quantizeStep = Math.max(0, mapping.quantizeStep ?? 0);
      if (quantizeStep > 0) {
        mapped = Math.round(mapped / quantizeStep) * quantizeStep;
      }

      state.set(key, { lastOutput: mapped, lastUpdatedMs: nowMs });
    } else {
      const quantizeStep = Math.max(0, mapping.quantizeStep ?? 0);
      if (quantizeStep > 0) {
        mapped = Math.round(mapped / quantizeStep) * quantizeStep;
      }
    }

    result[mapping.targetParam] = mapped;
  }

  return result;
}
