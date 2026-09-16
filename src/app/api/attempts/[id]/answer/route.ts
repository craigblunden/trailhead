import { INTERVIEW_FAILURES, type RecordAnswerResponse } from "@/lib/interview";
import { parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { answerQuestion, endAttempt } from "@/server/interview/answer-attempt";
import { INTERVIEW_STATUS, badBody, notFound, reply, unauthenticated } from "@/server/interview/reply";
import { logError } from "@/server/log";
import { parseInput, recordAnswerSchema } from "@/server/validation";

/**
 * POST /api/attempts/:id/answer — records one Answer against its question and adds the seconds it
 * took to the Attempt's active time, returning the Attempt as it then stands. With no body, it is
 * the countdown running out instead: the Attempt ends where it stands, whatever was being typed
 * unrecorded and the remaining questions unanswered.
 *
 * A Route Handler rather than a Server Action for the same reason the rest of this feature is one:
 * an Answer lands while a clock is running, and queueing it behind the page's other edits would
 * make the countdown lie. Which questions may still be answered, and when an Attempt is finished, is
 * the orchestration layer's; this handler checks the session, the id, and the body.
 */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, unauthenticated);

  const attempt = parseId((await params).id, "attempt");
  if (!attempt.ok) return reply(404, notFound);

  const raw = await request.text().catch(() => null);
  if (raw === null) return reply(400, badBody);

  try {
    // No body at all is the countdown expiring, not an Answer: there is nothing to record.
    const outcome = raw.trim() === "" ? await endAttempt(attempt.id) : await recordFrom(raw, attempt.id);
    if (outcome === null) return reply(400, badBody);
    if (outcome.ok) return reply(200, { ok: true, attempt: outcome.attempt } satisfies RecordAnswerResponse);

    return reply(outcome.unexpected ? 500 : INTERVIEW_STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: INTERVIEW_FAILURES[outcome.reason],
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, unauthenticated);
    if (error instanceof NotFoundError) return reply(404, notFound);
    logError({ operation: "interview.route.answer", tenant: session.userId }, error);
    return reply(500, { ok: false, error: "failed", message: INTERVIEW_FAILURES.failed });
  }
}

/** The Answer in the body, or null when the body is not one. */
async function recordFrom(raw: string, attemptId: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const body = parseInput(recordAnswerSchema, json);
  return body.ok ? answerQuestion(attemptId, body.data) : null;
}
