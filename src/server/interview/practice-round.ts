import "server-only";

import { PRACTICE_FAILURES, type PracticeFailure, type PracticeRound } from "@/lib/practice";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { RuleError } from "@/server/data/errors";
import { completePracticeRound, openPracticeRound, recordPracticeAnswer } from "@/server/data/practice";
import { logError } from "@/server/log";

/**
 * Starting, answering, and ending a Practice round (practice round ticket 03). The same division of
 * responsibility as an Attempt's (`./start-attempt.ts`, `./answer-attempt.ts`): the Route Handler maps an
 * outcome to HTTP, and this layer decides what the outcome is. There is far less of it — no model call,
 * no quota to reserve or give back — so nothing here can cost the Tenant anything.
 *
 * It throws only `UnauthenticatedError`, which a caller answers as 401. Everything else is an outcome.
 */

export type PracticeOutcome =
  | { ok: true; round: PracticeRound }
  | { ok: false; reason: PracticeFailure; round?: PracticeRound; unexpected?: true };

/** Starts a round, or says why not — handing back the unfinished one an `in-progress` refusal is about. */
export async function startPracticeRound({ reset }: { reset: boolean }): Promise<PracticeOutcome> {
  const { userId: tenant } = await requireSession();
  try {
    return await openPracticeRound({ reset });
  } catch (error) {
    return failure(error, { tenant, operation: "practice.start" });
  }
}

/** One Answer recorded, with the seconds it took. A second Answer to a question, or a finished round, is `no-round`. */
export async function answerPracticeQuestion(
  roundId: string,
  answer: { questionId: string; transcript: string; elapsedSeconds: number },
): Promise<PracticeOutcome> {
  const { userId: tenant } = await requireSession();
  try {
    return { ok: true, round: await recordPracticeAnswer(roundId, answer) };
  } catch (error) {
    return failure(error, { tenant, operation: "practice.answer" });
  }
}

/** The countdown ran out: the round ends where it stands, keeping what was half-said on the question on screen. */
export async function endPracticeRound(
  roundId: string,
  partial?: { questionId: string; transcript: string },
): Promise<PracticeOutcome> {
  const { userId: tenant } = await requireSession();
  try {
    return { ok: true, round: await completePracticeRound(roundId, { partial }) };
  } catch (error) {
    return failure(error, { tenant, operation: "practice.end" });
  }
}

function failure(
  error: unknown,
  { tenant, operation }: { tenant: string; operation: string },
): { ok: false; reason: PracticeFailure; unexpected?: true } {
  if (error instanceof UnauthenticatedError) throw error;
  if (error instanceof RuleError && error.code in PRACTICE_FAILURES) {
    return { ok: false, reason: error.code as PracticeFailure };
  }
  logError({ operation, tenant }, error);
  return { ok: false, reason: "failed", unexpected: true };
}
