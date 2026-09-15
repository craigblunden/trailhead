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

/**
 * A date-picker widget works in local time, not UTC, so a `YYYY-MM-DD` becomes the local midnight
 * that names the same Y/M/D — never `new Date(iso)`, which is UTC midnight and can read back as
 * the day before in a timezone behind UTC.
 */
export function calendarDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The inverse of `calendarDate`: a local date's Y/M/D, read with the local (not UTC) accessors. */
export function isoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
