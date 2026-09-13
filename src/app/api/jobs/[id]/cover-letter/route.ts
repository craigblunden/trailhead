import { NextResponse } from "next/server";

import {
  FEEDBACK_UNREADABLE,
  GENERATION_FAILURES,
  type GenerationFailure,
  type GenerationResponse,
} from "@/lib/generation";
import { ACTION_MESSAGES, parseId } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { createClaudeClient } from "@/server/generation/cover-letter";
import { generateCoverLetter } from "@/server/generation/generate-cover-letter";
import { logError } from "@/server/log";
import { coverLetterRequestSchema, parseInput } from "@/server/validation";

/**
 * POST /api/jobs/:id/cover-letter — writes a cover letter from the Job's description and its
 * attached resume, and returns it as text. With a JSON body carrying `feedback`, it is a Rewrite of
 * the Job's Draft from that Feedback (feedback issue 04); with no body, or blank feedback, a fresh
 * write.
 *
 * A Route Handler, not a Server Action (ticket 18): Next dispatches a client's Server Actions one at
 * a time, and a 10–25 second generation as an action would hold every other edit on the page behind
 * it. This does not breach "Server Actions are the only write path": generation writes the quota
 * counter, the Job's Draft, and its Activity entry through the data layer, under the same session
 * and tenant rules as any action.
 *
 * Everything about the quota — reserving, giving back, Flags and Holds, and saying honestly which
 * happened — is the generation module's (architecture ticket 04). This handler checks the session,
 * the id, and the body, makes one call, and says what the outcome means in HTTP.
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
  held: 429,
  "no-resume": 409,
  "no-description": 409,
  "no-draft": 409,
  "hidden-feedback": 422,
};

const reply = (status: number, body: GenerationResponse) => NextResponse.json(body, { status });

const UNAUTHENTICATED = {
  ok: false,
  error: "unauthenticated",
  message: ACTION_MESSAGES.unauthenticated,
} as const;

/** The same words an action uses for a missing or foreign job. */
const NOT_FOUND = { ok: false, error: "not-found", message: new NotFoundError().shown } as const;

/** The card's shape for a body the handler cannot read, never a framework page. */
const BAD_BODY = { ok: false, error: "failed", message: FEEDBACK_UNREADABLE, refunded: false } as const;

/**
 * The optional JSON body: nothing, or `{ feedback }`. Validated like an action's input, before any
 * session or quota work. Null when the body cannot be read as the schema.
 */
async function readFeedback(request: Request): Promise<string | null> {
  const raw = await request.text().catch(() => null);
  if (raw === null) return null;
  if (raw.trim() === "") return "";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parseInput(coverLetterRequestSchema, json);
  return parsed.ok ? parsed.data.feedback : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, UNAUTHENTICATED);

  const job = parseId((await params).id, "job");
  if (!job.ok) return reply(404, NOT_FOUND);

  const feedback = await readFeedback(request);
  if (feedback === null) return reply(400, BAD_BODY);

  try {
    const outcome = await generateCoverLetter(job.id, { client: createClaudeClient(), feedback });
    if (outcome.ok) {
      return reply(200, {
        ok: true,
        letter: outcome.letter,
        quota: outcome.quota,
        verdict: outcome.verdict,
        setAside: outcome.setAside,
      });
    }
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
