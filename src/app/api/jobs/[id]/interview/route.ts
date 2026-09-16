import { INTERVIEW_FAILURES, type StartAttemptResponse } from "@/lib/interview";
import { parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { createInterviewClient } from "@/server/interview/claude";
import { startAttempt } from "@/server/interview/start-attempt";
import { logError } from "@/server/log";
import { INTERVIEW_STATUS, badBody, notFound, reply, unauthenticated } from "@/server/interview/reply";
import { parseInput, startAttemptSchema } from "@/server/validation";

/**
 * POST /api/jobs/:id/interview — starts an Attempt for one Job: reserves a unit of this week's
 * quota, generates a question set from the Job's description and the Tenant's resume, and persists
 * both. The body says which length, and whether an unfinished Attempt should be reset rather than
 * resumed.
 *
 * A Route Handler, not a Server Action, for the same reason the cover-letter route is one (ticket
 * 18): generating a question set takes 10–25 seconds, and Next dispatches a client's Server Actions
 * one at a time, so as an action it would hold every other edit on the page behind it.
 *
 * Everything about the quota — reserving, giving back, and saying honestly which happened — is the
 * orchestration layer's. This handler checks the session, the id, and the body, makes one call, and
 * says what the outcome means in HTTP.
 */

/** Seconds. The Claude call gives up well before this, so the handler always answers. */
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, unauthenticated);

  const job = parseId((await params).id, "job");
  if (!job.ok) return reply(404, notFound);

  const raw = await request.json().catch(() => null);
  const body = parseInput(startAttemptSchema, raw);
  if (!body.ok) return reply(400, badBody);

  try {
    const outcome = await startAttempt(job.id, {
      client: createInterviewClient(),
      length: body.data.length,
      reset: body.data.reset,
    });
    if (outcome.ok) {
      return reply(200, { ok: true, attempt: outcome.attempt, quota: outcome.quota } satisfies StartAttemptResponse);
    }
    // An error of this application's own is a 500, whatever the failure code says.
    return reply(outcome.unexpected ? 500 : INTERVIEW_STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: INTERVIEW_FAILURES[outcome.reason],
      quota: outcome.quota,
      refunded: outcome.refunded,
      // A `in-progress` refusal carries the unfinished Attempt, so the page can offer to resume it
      // without a second round trip.
      ...(outcome.attempt ? { attempt: outcome.attempt } : {}),
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, unauthenticated);
    if (error instanceof NotFoundError) return reply(404, notFound);
    logError({ operation: "interview.route.start", tenant: session.userId }, error);
    return reply(500, { ok: false, error: "failed", message: INTERVIEW_FAILURES.failed, refunded: false });
  }
}
