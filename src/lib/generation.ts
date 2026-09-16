import { nextWeekStart } from "@/lib/dates";
import type { Limit } from "@/lib/plans";

/**
 * Cover-letter generation, the parts both sides of the boundary share (ticket 18; feedback issues
 * 02 and 04). Pure.
 *
 * The quota is the application's only guard on its one unbounded-cost surface: a Plan's letters
 * per week (`src/lib/plans.ts`), the week running Monday to Sunday in UTC like every other date in
 * the app. The same week counts Flags (`CONTEXT.md`): writes whose Feedback carried directions to
 * the writer. At the second Flag the Tenant is on Hold until the week rolls over.
 */

/** Below this many characters, a job description tends to produce a generic letter. */
export const SHORT_DESCRIPTION_CHARS = 300;

/** Feedback is a couple of sentences about the letter, and the box says so by its size. */
export const FEEDBACK_MAX_CHARS = 500;

/** Flags in one quota week that place a Hold on letters until the week rolls over. */
export const HOLD_FLAGS = 2;

export type QuotaStatus = {
  /** The Tenant's letters-per-week Limit. */
  limit: Limit;
  used: number;
  /** Letters left this week; "unlimited" under an unlimited Limit. */
  remaining: Limit;
  /** ISO `YYYY-MM-DD`: the Monday (UTC) the next window opens — and the day a Hold lapses. */
  resetsOn: string;
  /** This week's Flags, so the card can say "one more pauses letters". */
  flags: number;
  /** On Hold: letters are paused until `resetsOn`, whatever `remaining` says. */
  held: boolean;
};

/** A Tenant is on Hold while this week's Flags have reached `HOLD_FLAGS`. Derived, never stored. */
export function isHeld(flagged: number): boolean {
  return flagged >= HOLD_FLAGS;
}

/** What one quota week's row counts: letters used, and Flags. */
export type QuotaCounts = { used: number; flagged: number };

/** A week with no row yet. */
export const NO_COUNTS: QuotaCounts = { used: 0, flagged: 0 };

export function quotaStatus({ used, flagged }: QuotaCounts, weekStart: string, limit: Limit): QuotaStatus {
  const resetsOn = nextWeekStart(weekStart);
  const flags = Math.max(flagged, 0);
  const held = isHeld(flags);
  if (limit === "unlimited") {
    return { limit, used: Math.max(used, 0), remaining: "unlimited", resetsOn, flags, held };
  }
  // A Tenant moved to a smaller Plan can hold a count above its Limit; the status never shows a
  // negative "left".
  const clamped = Math.min(Math.max(used, 0), limit);
  return { limit, used: clamped, remaining: limit - clamped, resetsOn, flags, held };
}

/**
 * What the writer says about the material it was given, in the same call that writes the letter:
 * `none`; `material` when the posting or the resume carried directions addressed to an AI or to the
 * writer (ignored, and reported to the user as something to know about that posting); `feedback`
 * when the Feedback asked for a different task or for the writer to change its instructions — a Flag.
 */
export const VERDICTS = ["none", "material", "feedback"] as const;

export type Verdict = (typeof VERDICTS)[number];

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
  held: "Cover letters are paused until Monday.",
  "no-resume": "Attach a resume in this job’s application kit first — the letter is written from it.",
  "no-description": "Paste the job posting into this job’s description first — the letter is written from it.",
  "no-draft": "There’s no draft on this job to rewrite yet. Write a letter first, then say what should change.",
  "hidden-feedback": "That feedback contained hidden characters and wasn’t sent.",
} as const;

export type GenerationFailure = keyof typeof GENERATION_FAILURES;

/**
 * Failures that give the reserved letter back: ours and Anthropic's. A refusal is the one failure the
 * user's own material can cause, and refunding it made probing for one free, so it stays counted
 * (feedback issue 04).
 */
export const REFUNDED_FAILURES: readonly GenerationFailure[] = ["failed", "timed-out", "truncated"];

/** The route's reply to a body it cannot read as Feedback; the card shows it in its failure block. */
export const FEEDBACK_UNREADABLE = `That feedback couldn’t be read. Keep it to plain text under ${FEEDBACK_MAX_CHARS} characters and try again.`;

/** What the cover-letter route accepts as its optional JSON body. */
export type GenerationRequest = { feedback?: string };

/** What the cover-letter route returns, as JSON. */
export type GenerationResponse =
  | {
      ok: true;
      letter: string;
      quota?: QuotaStatus;
      verdict: Verdict;
      /** The writer declined a change that would go beyond what the resume shows, and kept the letter honest. */
      setAside: boolean;
    }
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
