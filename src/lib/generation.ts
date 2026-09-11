/**
 * Cover-letter generation, the parts both sides of the boundary share (ticket 18). Pure.
 *
 * The quota is the application's only guard on its one unbounded-cost surface: five letters per
 * user per week, the week running Monday to Sunday in UTC like every other date in the app.
 */

export const COVER_LETTER_QUOTA = 5;

/** Below this many characters, a job description tends to produce a generic letter. */
export const SHORT_DESCRIPTION_CHARS = 300;

export type QuotaStatus = {
  limit: number;
  used: number;
  remaining: number;
  /** ISO `YYYY-MM-DD`: the Monday (UTC) the next window opens. */
  resetsOn: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The Monday (UTC) that starts the quota week containing `now`. */
export function weekStartOf(now: Date = new Date()): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return iso(day);
}

export function nextWeekStart(weekStart: string): string {
  const day = new Date(`${weekStart}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 7);
  return iso(day);
}

export function quotaStatus(used: number, weekStart: string): QuotaStatus {
  const clamped = Math.min(Math.max(used, 0), COVER_LETTER_QUOTA);
  return {
    limit: COVER_LETTER_QUOTA,
    used: clamped,
    remaining: COVER_LETTER_QUOTA - clamped,
    resetsOn: nextWeekStart(weekStart),
  };
}

/** "Monday, Sep 14" — when the next letters arrive. */
export function formatResetDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Every way generation can end without a letter, as codes the route returns and the card explains.
 * Each message says what happened and what the user can do; the card adds whether a letter was used.
 */
export const GENERATION_FAILURES = {
  refused:
    "Claude declined to write a letter for this job. That usually means something in the job description or resume was read as a request it won’t help with. Check the description is the posting itself, then try again.",
  failed:
    "The writing service had a problem and no letter came back. It’s usually brief — try again in a minute.",
  "timed-out":
    "Writing took longer than it should, so we stopped waiting. Try again; if it keeps happening, try a shorter job description.",
  truncated: "The letter came back unfinished. Try again.",
  unavailable: "Cover letters aren’t available on this deployment yet.",
  quota: "You’ve used this week’s cover letters.",
  "no-resume": "Attach a resume in this job’s application kit first — the letter is written from it.",
} as const;

export type GenerationFailure = keyof typeof GENERATION_FAILURES;

/** Failures that give the reserved letter back. Only a delivered letter uses one up. */
export const REFUNDED_FAILURES: readonly GenerationFailure[] = ["refused", "failed", "timed-out", "truncated"];

/** What the cover-letter route returns, as JSON. */
export type GenerationResponse =
  | { ok: true; letter: string; quota?: QuotaStatus }
  | {
      ok: false;
      error: GenerationFailure | "unauthenticated" | "not-found";
      message: string;
      quota?: QuotaStatus;
      /**
       * True only when a letter was reserved and then given back. The card says "this didn't use one
       * of your letters" on this alone, never on the error code.
       */
      refunded?: boolean;
    };
