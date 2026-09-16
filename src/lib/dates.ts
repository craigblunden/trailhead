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

/**
 * The quota week: Monday to Sunday, UTC, like every other date here. Two features count against a
 * week of their own — cover letters (`@/lib/generation`) and Interview Simulator Attempts
 * (`@/lib/interview`) — and both mean the same week, so the arithmetic lives here rather than in
 * either of them.
 */

/** The Monday (UTC) that starts the quota week containing `now`. */
export function weekStartOf(now: Date = new Date()): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return isoDate(day);
}

/** The Monday (UTC) after `weekStart`: when the next window opens. */
export function nextWeekStart(weekStart: string): string {
  const day = new Date(`${weekStart}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 7);
  return isoDate(day);
}

/** "Monday, Sep 14" — when the next window opens, and when a Hold lapses. */
export function formatResetDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
