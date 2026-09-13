import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { REFUNDED_FAILURES, type GenerationFailure, type QuotaStatus, type Verdict } from "@/lib/generation";
import { hasTagCharacters } from "@/lib/invisible";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  coverLetterSources,
  flagWithoutLetter,
  generationQuota,
  refundCoverLetter,
  reserveCoverLetter,
  storeCoverLetter,
} from "@/server/data/generation";
import { logError, logEvent } from "@/server/log";

import { writeCoverLetter } from "./cover-letter";
import type { CoverLetterInputs } from "./prompt";

/**
 * Writing a cover letter for one Job, under the weekly quota (architecture ticket 04; tickets 18, 19;
 * feedback issue 04). One call, one outcome. What it takes care of, in an order no caller can get
 * wrong:
 *
 * 1. **Unavailable before anything is read.** No Claude client means no letter, and says so.
 * 2. **What the letter is written from.** A missing or foreign Job throws `NotFoundError`; a Job with
 *    no usable resume, or no description, is refused before any quota is taken. With Feedback, the
 *    Job must have a Draft to rewrite, or it is `no-draft` — also before any reservation.
 * 3. **The deterministic check.** Tag characters in Feedback are `hidden-feedback`: refused before
 *    any reservation, and counted as a Flag. Nothing reaches the reservation without passing it.
 * 4. **One letter reserved, atomically, before the call.** Refused as `held` on Hold and `quota`
 *    when none is left. There is no path to Claude that does not pass through the reservation.
 * 5. **The call**, outside any transaction, and its verdict in the same answer as the letter.
 * 6. **A delivered letter is stored and counted.** The Draft, the Activity entry, and — if the
 *    verdict made it a Flag — the Flag, in one transaction. A Flag never refunds.
 * 7. **Only our failures give the letter back.** An API error, a timeout, a truncated or malformed
 *    answer, or a crash after reserving refunds; a refusal does not. `refunded` is true only when
 *    giving it back worked, so the user is never told a letter was not counted when it was.
 *
 * It throws only `UnauthenticatedError` and `NotFoundError`, which a caller answers as 401 and 404.
 * Everything else is an outcome. Feedback is read here and sent to the writer; it is stored nowhere.
 */

export type CoverLetterOutcome =
  | { ok: true; letter: string; verdict: Verdict; setAside: boolean; quota?: QuotaStatus }
  | {
      ok: false;
      reason: GenerationFailure;
      /** True only when a letter was reserved and then given back. */
      refunded: boolean;
      quota?: QuotaStatus;
      /** The failure was this application's own error, not an answer from Claude. */
      unexpected?: true;
    };

/** Refusals that happen before a letter is reserved, so there is nothing to give back. */
const BEFORE_RESERVING: readonly GenerationFailure[] = ["quota", "held", "no-resume", "no-description", "no-draft"];

/** The quota as it stands, or nothing if it cannot be read: no answer waits on the count. */
const quotaNow = () => generationQuota().catch(() => undefined);

export async function generateCoverLetter(
  jobId: string,
  { client, feedback = "" }: { client: Anthropic | null; feedback?: string },
): Promise<CoverLetterOutcome> {
  const { userId: tenant } = await requireSession();
  if (!client) return { ok: false, reason: "unavailable", refunded: false };
  const rewrite = feedback.length > 0;

  // Set while a letter is taken from the quota and not yet delivered, so every way out can give it back.
  let reservedWeek: string | null = null;

  /** Gives the reserved letter back, if one is, and reports whether that worked. */
  const giveBack = async (): Promise<{ refunded: boolean; quota?: QuotaStatus }> => {
    const week = reservedWeek;
    reservedWeek = null;
    if (!week) return { refunded: false, quota: await quotaNow() };
    try {
      return { refunded: true, quota: await refundCoverLetter(week) };
    } catch (error) {
      logError({ operation: "generation.refund", tenant }, error);
      return { refunded: false, quota: await quotaNow() };
    }
  };

  try {
    const sources = await coverLetterSources(jobId, { rewrite });

    if (rewrite && hasTagCharacters(feedback)) {
      // Never reaches the reservation, and never reaches Claude: a Flag without a letter.
      const quota = await flagWithoutLetter();
      logEvent({ operation: "generation.flag", tenant, source: "hidden" });
      return { ok: false, reason: "hidden-feedback", refunded: false, quota };
    }

    const { draft, ...material } = sources;
    const inputs: CoverLetterInputs = rewrite ? { ...material, previousLetter: draft, feedback } : material;

    reservedWeek = (await reserveCoverLetter()).weekStart;
    const weekStart = reservedWeek;

    // The call, outside any transaction.
    const outcome = await writeCoverLetter(inputs, { client, tenant });
    if (outcome.ok) {
      // A `feedback` verdict is a Flag only when there was Feedback to carry directions; a fresh write
      // has none, so a writer that says otherwise is not believed against the user.
      const verdict = rewrite || outcome.verdict !== "feedback" ? outcome.verdict : "none";
      const flag = verdict === "feedback";
      const quota = await storeCoverLetter(jobId, outcome.letter, { rewrite, flag, weekStart });
      reservedWeek = null; // Delivered and stored: this letter is used.
      if (flag) logEvent({ operation: "generation.flag", tenant, source: "feedback" });
      return { ok: true, letter: outcome.letter, verdict, setAside: outcome.setAside, quota };
    }
    if (REFUNDED_FAILURES.includes(outcome.reason)) {
      return { ok: false, reason: outcome.reason, ...(await giveBack()) };
    }
    reservedWeek = null;
    return { ok: false, reason: outcome.reason, refunded: false, quota: await quotaNow() };
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof NotFoundError) throw error;
    const refusal = error instanceof RuleError ? BEFORE_RESERVING.find((code) => code === error.code) : undefined;
    if (refusal) return { ok: false, reason: refusal, refunded: false, quota: await quotaNow() };

    logError({ operation: "generation.coverLetter", tenant }, error);
    return { ok: false, reason: "failed", unexpected: true, ...(await giveBack()) };
  }
}
