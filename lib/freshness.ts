import type { ISO8601 } from './types';

export interface Freshness {
  generatedAt: ISO8601;
  ageMinutes: number;
  isStale: boolean;
}

// 26 hours — this board refreshes ONCE A DAY (cron at a fixed hour, ~24h apart),
// so the payload is legitimately ~24h old for most of the day. Staleness must mean
// "a daily run was actually missed", not "more than an hour since the last run".
// 24h + 2h grace (cron jitter / timezone / Vercel build lag) → the board greys out
// only after a full daily refresh has been skipped, never during normal operation.
// (Was 90 min — an hourly/realtime threshold wrongly carried over from the
// efficiency-dashboard family; it greyed the board ~1.5h after each daily refresh.)
const DEFAULT_STALE_MIN = 26 * 60;

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
