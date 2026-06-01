import type { ISO8601 } from './types';

export interface Freshness {
  generatedAt: ISO8601;
  ageMinutes: number;
  isStale: boolean;
}

// 90 min — the ≥ daily refresh keeps us well under this in steady state;
// > 90 min on an hourly cron means at least one push failed and the board greys out.
const DEFAULT_STALE_MIN = 90;

export function freshness(
  generatedAt: ISO8601,
  staleMin: number = DEFAULT_STALE_MIN,
  now: Date = new Date(),
): Freshness {
  const generated = new Date(generatedAt).getTime();
  const ageMs = now.getTime() - generated;
  const ageMinutes = Math.max(0, Math.round(ageMs / 60000));
  return {
    generatedAt,
    ageMinutes,
    isStale: ageMinutes > staleMin,
  };
}

export function formatAge(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
