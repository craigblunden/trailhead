import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { REFUNDED_FAILURES, type GenerationFailure, type QuotaStatus } from "@/lib/generation";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  coverLetterInputs,
  generationQuota,
  refundCoverLetter,
  reserveCoverLetter,
} from "@/server/data/generation";
import { logError } from "@/server/log";

import { writeCoverLetter } from "./cover-letter";

/**
 * Writing a cover letter for one Job, under the weekly quota (architecture ticket 04; tickets 18, 19).
 * One call, one outcome. What it takes care of, so that no caller can get it wrong:
 *
 * 1. **Unavailable before anything is read.** No Claude client means no letter, and says so.
 * 2. **What the letter is written from.** A missing or foreign Job throws `NotFoundError`; a Job with
 *    no usable resume, or no description, is refused before any quota is taken.
 * 3. **One letter reserved, atomically, before the call.** There is no path to Claude that does not
 *    pass through the reservation.
 * 4. **Only a delivered letter uses one up.** A refusal, an API error, a timeout, a truncated letter,
 *    or a crash after reserving gives it back — and `refunded` is true only when giving it back
 *    worked, so the user is never told a letter was not counted when it was.
 *
 * It throws only `UnauthenticatedError` and `NotFoundError`, which a caller answers as 401 and 404.
 * Everything else is an outcome.
 */

export type CoverLetterOutcome =
  | { ok: true; letter: string; quota?: QuotaStatus }
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
const BEFORE_RESERVING: readonly GenerationFailure[] = ["quota", "no-resume", "no-description"];

/** The quota as it stands, or nothing if it cannot be read: no answer waits on the count. */
const quotaNow = () => generationQuota().catch(() => undefined);

export async function generateCoverLetter(
  jobId: string,
  { client }: { client: Anthropic | null },
): Promise<CoverLetterOutcome> {
  const { userId: tenant } = await requireSession();
  if (!client) return { ok: false, reason: "unavailable", refunded: false };

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
    const inputs = await coverLetterInputs(jobId);
    reservedWeek = (await reserveCoverLetter()).weekStart;

    // The call, outside any transaction.
    const outcome = await writeCoverLetter(inputs, { client, tenant });
    if (outcome.ok) {
      reservedWeek = null; // Delivered: this letter is used.
      return { ok: true, letter: outcome.letter, quota: await quotaNow() };
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
