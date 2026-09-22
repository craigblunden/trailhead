import { NextResponse } from "next/server";

import { FOOTING_FAILURES, type FootingResponse } from "@/lib/footing";
import { parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { createFootingClient } from "@/server/footing/typesafe";
import { FOOTING_STATUS, footingScore } from "@/server/footing/score-footing";
import { unauthenticated, notFound } from "@/server/interview/reply";
import { logError } from "@/server/log";

/**
 * POST /api/jobs/:id/footing — scores this Job's posting against its Application kit and keeps the
 * result (footing tickets 03, 04). The Tenant's act: nothing here runs on a save, an upload, or a
 * schedule.
 *
 * A Route Handler rather than a Server Action, for the reason the cover-letter and interview routes
 * are: Next dispatches a client's Server Actions one at a time, so as an action this would hold every
 * other edit on the job page behind it while the provider thinks.
 *
 * There is no body. The Job is the whole request, the dimensions are fixed by us, and nothing the
 * browser sends could change what is asked.
 */

/** Seconds. The provider call gives up at 25, so the handler always answers. */
export const maxDuration = 45;

const reply = (status: number, body: FootingResponse) => NextResponse.json(body, { status });

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, unauthenticated);

  const job = parseId((await params).id, "job");
  if (!job.ok) return reply(404, notFound);

  try {
    const outcome = await footingScore(job.id, { client: createFootingClient() });
    if (outcome.ok) {
      return reply(200, { ok: true, footing: outcome.footing, previous: outcome.previous });
    }
    // An error of this application's own is a 500, whatever the failure code says.
    return reply(outcome.unexpected ? 500 : FOOTING_STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: FOOTING_FAILURES[outcome.reason],
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, unauthenticated);
    if (error instanceof NotFoundError) return reply(404, notFound);
    logError({ operation: "footing.route.score", tenant: session.userId }, error);
    return reply(500, { ok: false, error: "failed", message: FOOTING_FAILURES.failed });
  }
}
