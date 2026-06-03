import type { ISO8601 } from './types';

export interface Freshness {
  generatedAt: ISO8601;
  ageMinutes: number;
  isStale: boolean;
}

// 24 hours — this board refreshes ONCE A DAY, so one full day matches the cadence:
// the board reads fresh through the daily cycle and only greys once the payload is
// over a day old. If a refresh runs a little late the board may grey briefly before
// the new data lands — that's fine and, if anything, an honest "refresh is overdue"
// signal. (Was 90 min — an hourly/realtime threshold wrongly carried over from the
// efficiency-dashboard family; it greyed the board ~1.5h after each daily refresh.)
const DEFAULT_STALE_MIN = 24 * 60;

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
