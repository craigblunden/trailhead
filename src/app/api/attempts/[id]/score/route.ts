import { INTERVIEW_FAILURES, type ScoreAttemptResponse } from "@/lib/interview";
import { parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { scoreAttempt } from "@/server/interview/answer-attempt";
import { createInterviewClient } from "@/server/interview/claude";
import { INTERVIEW_STATUS, notFound, reply, unauthenticated } from "@/server/interview/reply";
import { logError } from "@/server/log";

/**
 * POST /api/attempts/:id/score — scores a completed Attempt and returns it with its Scorecard: a
 * score and rationale for every Answer, rolled up per Category and into one overall score.
 *
 * Takes no body: what is scored is what was already recorded. Scoring spends no quota — the Attempt
 * was counted when it was started — so a failure here is always safe to retry.
 */

/** Seconds. The Claude call gives up well before this, so the handler always answers. */
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, unauthenticated);

  const attempt = parseId((await params).id, "attempt");
  if (!attempt.ok) return reply(404, notFound);

  try {
    const outcome = await scoreAttempt(attempt.id, { client: createInterviewClient() });
    if (outcome.ok) {
      return reply(200, {
        ok: true,
        attempt: outcome.attempt,
        scorecard: outcome.scorecard,
        askForFeedback: outcome.askForFeedback,
      } satisfies ScoreAttemptResponse);
    }
    return reply(outcome.unexpected ? 500 : INTERVIEW_STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: INTERVIEW_FAILURES[outcome.reason],
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, unauthenticated);
    if (error instanceof NotFoundError) return reply(404, notFound);
    logError({ operation: "interview.route.score", tenant: session.userId }, error);
    return reply(500, { ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });
  }
}
