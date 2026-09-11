import { NextResponse } from "next/server";

import { GENERATION_FAILURES, type GenerationFailure, type GenerationResponse } from "@/lib/generation";
import { ACTION_MESSAGES, parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { createClaudeClient } from "@/server/generation/cover-letter";
import { generateCoverLetter } from "@/server/generation/generate-cover-letter";
import { logError } from "@/server/log";

/**
 * POST /api/jobs/:id/cover-letter — writes a cover letter from the Job's description and its
 * attached resume, and returns it as text.
 *
 * A Route Handler, not a Server Action (ticket 18): Next dispatches a client's Server Actions one at
 * a time, and a 10–25 second generation as an action would hold every other edit on the page behind
 * it. This does not breach "Server Actions are the only write path": generation writes nothing but
 * the quota counter, through the data layer, under the same session and tenant rules as any action.
 *
 * Everything about the quota — reserving, giving back, and saying honestly which happened — is the
 * generation module's (architecture ticket 04). This handler checks the session and the id, makes
 * one call, and says what the outcome means in HTTP.
 */

/** Seconds. The Claude call gives up well before this, so the handler always answers. */
export const maxDuration = 60;

const STATUS: Record<GenerationFailure, number> = {
  refused: 422,
  failed: 502,
  "timed-out": 504,
  truncated: 502,
  unavailable: 503,
  quota: 429,
  "no-resume": 409,
  "no-description": 409,
};

const reply = (status: number, body: GenerationResponse) => NextResponse.json(body, { status });

const UNAUTHENTICATED = {
  ok: false,
  error: "unauthenticated",
  message: ACTION_MESSAGES.unauthenticated,
} as const;

/** The same words an action uses for a missing or foreign job. */
const NOT_FOUND = { ok: false, error: "not-found", message: new NotFoundError().shown } as const;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, UNAUTHENTICATED);

  const job = parseId((await params).id, "job");
  if (!job.ok) return reply(404, NOT_FOUND);

  try {
    const outcome = await generateCoverLetter(job.id, { client: createClaudeClient() });
    if (outcome.ok) return reply(200, { ok: true, letter: outcome.letter, quota: outcome.quota });
    // An error of this application's own is a 500, whatever the letter's failure code says.
    return reply(outcome.unexpected ? 500 : STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: GENERATION_FAILURES[outcome.reason],
      quota: outcome.quota,
      refunded: outcome.refunded,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, UNAUTHENTICATED);
    if (error instanceof NotFoundError) return reply(404, NOT_FOUND);
    // Anything else is this application's own error, before a letter could be reserved (the module
    // catches everything after). The card still gets the shape it reads, never a framework error page.
    logError({ operation: "generation.route", tenant: session.userId }, error);
    return reply(500, { ok: false, error: "failed", message: GENERATION_FAILURES.failed, refunded: false });
  }
}
