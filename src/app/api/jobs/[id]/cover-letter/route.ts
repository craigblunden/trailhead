import { NextResponse } from "next/server";

import {
  GENERATION_FAILURES,
  REFUNDED_FAILURES,
  type GenerationFailure,
  type GenerationResponse,
  type QuotaStatus,
} from "@/lib/generation";
import { ACTION_MESSAGES } from "@/server/action-result";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  coverLetterInputs,
  generationQuota,
  refundCoverLetter,
  reserveCoverLetter,
} from "@/server/data/generation";
import { createClaudeClient, writeCoverLetter } from "@/server/generation/cover-letter";
import { logError } from "@/server/log";
import { idSchema, parseInput } from "@/server/validation";

/**
 * POST /api/jobs/:id/cover-letter — writes a cover letter from the Job's description and its
 * attached resume, and returns it as text.
 *
 * A Route Handler, not a Server Action (ticket 18): Next dispatches a client's Server Actions one at
 * a time, and a 10–25 second generation as an action would hold every other edit on the page behind
 * it. This does not breach "Server Actions are the only write path": generation writes nothing but
 * the quota counter, through the data layer, under the same session and tenant rules as any action.
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
};

const reply = (status: number, body: GenerationResponse) => NextResponse.json(body, { status });

const UNAUTHENTICATED = {
  ok: false,
  error: "unauthenticated",
  message: ACTION_MESSAGES.unauthenticated,
} as const;

/** The same words an action uses for a missing or foreign job. */
const NOT_FOUND = { ok: false, error: "not-found", message: `${new NotFoundError().message}.` } as const;

/** Gives a reserved letter back. Reports whether it worked, so the user is never told so wrongly. */
async function giveBack(weekStart: string, tenant: string): Promise<{ refunded: boolean; quota?: QuotaStatus }> {
  try {
    return { refunded: true, quota: await refundCoverLetter(weekStart) };
  } catch (error) {
    logError({ operation: "generation.refund", tenant }, error);
    return { refunded: false, quota: await generationQuota().catch(() => undefined) };
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return reply(401, UNAUTHENTICATED);

  const parsedId = parseInput(idSchema, (await params).id);
  if (!parsedId.ok) return reply(404, NOT_FOUND);

  // Set while a letter is taken from the quota and not yet delivered, so every way out of this
  // handler — a failure outcome or an exception — can give it back.
  let reservedWeek: string | null = null;

  try {
    // 1. What the letter is written from. A foreign job or a missing resume stops here, before
    //    any quota is taken.
    const inputs = await coverLetterInputs(parsedId.data);

    const client = createClaudeClient();
    if (!client) {
      return reply(503, { ok: false, error: "unavailable", message: GENERATION_FAILURES.unavailable });
    }

    // 2. One letter from this week's quota, atomically. Calling this handler directly meets the same
    //    rule: there is no path to Claude that does not pass through the reservation.
    reservedWeek = (await reserveCoverLetter()).weekStart;

    // 3. The call, outside any transaction.
    const outcome = await writeCoverLetter(inputs, { client, tenant: session.userId });
    if (outcome.ok) {
      reservedWeek = null; // Delivered: this letter is used.
      // A written letter is returned even if the count cannot be read back.
      const quota = await generationQuota().catch(() => undefined);
      return reply(200, { ok: true, letter: outcome.letter, quota });
    }

    // 4. No letter was delivered, so the reservation is given back.
    const week = reservedWeek;
    reservedWeek = null;
    const { refunded, quota } = REFUNDED_FAILURES.includes(outcome.reason)
      ? await giveBack(week, session.userId)
      : { refunded: false, quota: await generationQuota().catch(() => undefined) };
    return reply(STATUS[outcome.reason], {
      ok: false,
      error: outcome.reason,
      message: GENERATION_FAILURES[outcome.reason],
      quota,
      refunded,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return reply(401, UNAUTHENTICATED);
    if (error instanceof NotFoundError) return reply(404, NOT_FOUND);
    if (error instanceof RuleError && (error.code === "quota" || error.code === "no-resume")) {
      const code = error.code as GenerationFailure;
      return reply(STATUS[code], {
        ok: false,
        error: code,
        message: GENERATION_FAILURES[code],
        quota: await generationQuota().catch(() => undefined),
        refunded: false,
      });
    }
    logError({ operation: "generation.route", tenant: session.userId }, error);
    const { refunded, quota } = reservedWeek
      ? await giveBack(reservedWeek, session.userId)
      : { refunded: false, quota: undefined };
    return reply(500, { ok: false, error: "failed", message: GENERATION_FAILURES.failed, quota, refunded });
  }
}
