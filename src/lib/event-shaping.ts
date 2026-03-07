import type { EventArticulation } from '@/types/sonification';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function eventMetricFromParams(params: Partial<Record<string, number>>): number | undefined {
  if (typeof params.velocity === 'number') {
    return clamp01(params.velocity);
  }
  if (typeof params.scaleIndex === 'number') {
    return clamp01(Math.abs(params.scaleIndex) / 12);
  }
  if (typeof params.frequency === 'number') {
    const min = 55;
    const max = 1760;
    const safe = Math.max(min, params.frequency);
    return clamp01((Math.log2(safe / min)) / Math.log2(max / min));
  }
  return undefined;
}

export function passesThreshold(prevMetric: number | undefined, nextMetric: number | undefined, threshold: number): boolean {
  const safeThreshold = clamp01(threshold);
  if (safeThreshold <= 0 || nextMetric === undefined) return true;
  if (prevMetric === undefined) return true;
  return Math.abs(nextMetric - prevMetric) >= safeThreshold;
}

export function passesCooldown(nowMs: number, lastTriggeredAtMs: number | undefined, cooldownMs: number): boolean {
  const cooldown = Math.max(0, Math.floor(cooldownMs));
  if (cooldown <= 0) return true;
  const last = lastTriggeredAtMs ?? 0;
  return nowMs - last >= cooldown;
}

export function nextBurstHistory(
  nowMs: number,
  history: number[] | undefined,
  burstCap = 0,
  burstWindowMs = 1200
): { allowed: boolean; history: number[] } {
  const cap = Math.max(0, Math.floor(burstCap));
  if (cap <= 0) return { allowed: true, history: history ?? [] };
  const windowMs = Math.max(100, Math.floor(burstWindowMs));
  const kept = (history ?? []).filter((ts) => nowMs - ts <= windowMs);
  if (kept.length >= cap) return { allowed: false, history: kept };
  kept.push(nowMs);
  return { allowed: true, history: kept };
}

export function articulationDuration(articulation: EventArticulation): string {
  switch (articulation) {
    case 'soft': return '4n';
    case 'punchy': return '16n';
    default: return '8n';
  }
}

export function articulationVelocity(velocity: number, articulation: EventArticulation): number {
  const base = Math.max(0.05, Math.min(1, velocity));
  const factor = articulation === 'soft' ? 0.75 : articulation === 'punchy' ? 1.2 : 1;
  return Math.max(0.05, Math.min(1, base * factor));
}
