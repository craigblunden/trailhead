import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  REFUNDED_INTERVIEW_FAILURES,
  canStartAttempt,
  isAttemptLength,
  isComplete,
  type Attempt,
  type KnownLength,
  type InterviewFailure,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import { limitsOf } from "@/lib/plans";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  interviewQuota,
  interviewSources,
  latestAttempt,
  refundAttempt,
  reserveAttempt,
  storeAttempt,
} from "@/server/data/interview";
import { currentPlan } from "@/server/data/plans";
import { logError } from "@/server/log";

import { generateQuestions } from "./claude";

/**
 * Starting an Attempt for one Job (interview simulator tickets 01, 04, 05, 08). One call, one
 * outcome — the same division of responsibility the cover letter has between its Route Handler, this
 * layer, and the Claude call. What it takes care of, in an order no caller can get wrong:
 *
 * 1. **Unavailable before anything is read.** No Claude client means no Attempt, and says so.
 * 2. **The Plan.** The simulator is a `pro` feature this phase (`not-pro`), and the Plan decides
 *    which lengths may be chosen (`bad-length`). Both are refused before any quota is taken.
 * 3. **An unfinished Attempt blocks a second one**, unless the Tenant asked to reset and has quota
 *    left — so abandoning and restarting can never be a way around the weekly Limit.
 * 4. **What the questions are drawn from.** A missing or foreign Job throws `NotFoundError`; a Job
 *    with no usable resume, or no description, is refused before any quota is taken.
 * 5. **One Attempt reserved, atomically, before the call.** Refused as `quota` when none is left.
 *    There is no path to Claude that does not pass through the reservation.
 * 6. **The call**, outside any transaction, and its question set persisted with the Attempt.
 * 7. **Only our failures give the Attempt back.** An API error, a timeout, a truncated or malformed
 *    answer, or a crash after reserving refunds; a refusal does not, for the same reason a refused
 *    letter stays counted. Abandoning a delivered question set never refunds either.
 *
 * It throws only `UnauthenticatedError` and `NotFoundError`, which a caller answers as 401 and 404.
 * Everything else is an outcome.
 */

export type StartOutcome =
  | { ok: true; attempt: Attempt; quota?: InterviewQuotaStatus }
  | {
      ok: false;
      reason: InterviewFailure;
      /** True only when an Attempt was reserved and then given back. */
      refunded: boolean;
      quota?: InterviewQuotaStatus;
      /** The failure was this application's own error, not an answer from Claude. */
      unexpected?: true;
      /** The unfinished Attempt a `in-progress` refusal is about, so the caller can offer to resume it. */
      attempt?: Attempt;
    };

/** Refusals that happen before an Attempt is reserved, so there is nothing to give back. */
const BEFORE_RESERVING: readonly InterviewFailure[] = [
  "quota",
  "not-pro",
  "bad-length",
  "no-resume",
  "no-description",
];

/** The quota as it stands, or nothing if it cannot be read: no answer waits on the count. */
const quotaNow = () => interviewQuota().catch(() => undefined);

export async function startAttempt(
  jobId: string,
  { client, length, reset = false }: { client: Anthropic | null; length: KnownLength; reset?: boolean },
): Promise<StartOutcome> {
  const { userId: tenant } = await requireSession();
  if (!client) return { ok: false, reason: "unavailable", refunded: false };

  // Set while an Attempt is taken from the quota and not yet delivered, so every way out can give it back.
  let reservedWeek: string | null = null;

  /** Gives the reserved Attempt back, if one is, and reports whether that worked. */
  const giveBack = async (): Promise<{ refunded: boolean; quota?: InterviewQuotaStatus }> => {
    const week = reservedWeek;
    reservedWeek = null;
    if (!week) return { refunded: false, quota: await quotaNow() };
    try {
      return { refunded: true, quota: await refundAttempt(week) };
    } catch (error) {
      logError({ operation: "interview.refund", tenant }, error);
      return { refunded: false, quota: await quotaNow() };
    }
  };

  try {
    const plan = await currentPlan();
    // This phase ships the locked preview for free and basic (interview simulator ticket 08); their
    // smaller real Limits are a later effort, so anything but `pro` is refused here outright.
    if (!canStartAttempt(plan)) return { ok: false, reason: "not-pro", refunded: false };

    const limits = limitsOf(plan);
    // A retired length is refused like any other the Plan does not offer (interview second pass ticket 04).
    if (!isAttemptLength(length) || !limits.interviewLengths.includes(length)) {
      return { ok: false, reason: "bad-length", refunded: false, quota: await quotaNow() };
    }

    // An unfinished Attempt is resumed, not replaced — unless the Tenant asked to reset, which
    // costs another quota unit and so cannot be used to dodge the Limit.
    const existing = await latestAttempt(jobId);
    if (existing && !existing.completedAt && !isComplete(existing) && !reset) {
      return {
        ok: false,
        reason: "in-progress",
        refunded: false,
        attempt: existing,
        quota: await quotaNow(),
      };
    }

    const sources = await interviewSources(jobId);

    reservedWeek = (await reserveAttempt()).weekStart;

    // The call, outside any transaction.
    const outcome = await generateQuestions({ ...sources, length }, { client, tenant });
    if (outcome.ok) {
      const attempt = await storeAttempt(jobId, length, outcome.questions);
      reservedWeek = null; // Delivered and stored: this Attempt is used.
      return { ok: true, attempt, quota: await quotaNow() };
    }
    if (REFUNDED_INTERVIEW_FAILURES.includes(outcome.reason)) {
      return { ok: false, reason: outcome.reason, ...(await giveBack()) };
    }
    reservedWeek = null;
    return { ok: false, reason: outcome.reason, refunded: false, quota: await quotaNow() };
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof NotFoundError) throw error;
    const refusal = error instanceof RuleError ? BEFORE_RESERVING.find((code) => code === error.code) : undefined;
    if (refusal) return { ok: false, reason: refusal, refunded: false, quota: await quotaNow() };

    logError({ operation: "interview.start", tenant }, error);
    return { ok: false, reason: "failed", unexpected: true, ...(await giveBack()) };
  }
}
