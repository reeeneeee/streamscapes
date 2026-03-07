import type { DataPoint } from '@/types/stream';
import type { SonificationMapping, GlobalConfig } from '@/types/sonification';

function applyCurve(
  value: number,
  curve: SonificationMapping['curve'],
  inputRange: [number, number],
  outputRange: [number, number],
  invert: boolean
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

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

export function applyMappings(
  dataPoint: DataPoint,
  mappings: readonly SonificationMapping[],
  _globalConfig: GlobalConfig
): Partial<Record<string, number>> {
  const result: Partial<Record<string, number>> = {};

  for (const mapping of mappings) {
    const rawValue = dataPoint.fields[mapping.sourceField];

    // Only map numeric fields
    if (typeof rawValue !== 'number') continue;

    result[mapping.targetParam] = applyCurve(
      rawValue,
      mapping.curve,
      mapping.inputRange,
      mapping.outputRange,
      mapping.invert
    );
  }

  return result;
}
