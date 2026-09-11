/**
 * Calendar dates as `YYYY-MM-DD` strings in UTC — the one convention every date in the app uses, so
 * server and client render the same day. Pure; importable on both sides.
 */

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Today as a UTC calendar date. Takes the clock as an argument so callers are testable. */
export function todayUtc(now: Date = new Date()): string {
  return isoDate(now);
}
