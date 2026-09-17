import { getOptionalSession, UnauthenticatedError } from "@/server/auth/session";
import { startPracticeRound } from "@/server/interview/practice-round";
import { practiceFailure, practiceReply, unauthenticated } from "@/server/interview/reply";
import { logError } from "@/server/log";
import { parseInput, startPracticeSchema } from "@/server/validation";

/**
 * POST /api/practice-rounds — starts a Practice round (practice round ticket 03): four questions from
 * the fixed set, on the eight-minute clock. The body says only whether an unfinished round should be
 * discarded for a fresh one. No model is called and no quota is taken.
 *
 * A Route Handler rather than a Server Action for the same reason as the rest of the Simulator: the
 * page it serves runs against a clock, and answers must never queue behind the page's other work.
 * Who may start one, and what happens to an unfinished round, is decided below this handler — in the
 * data layer, inside the transaction that writes the round.
 */
export async function POST(request: Request) {
  const session = await getOptionalSession();
  if (!session) return practiceReply(401, unauthenticated);

  const raw = await request.json().catch(() => null);
  const body = parseInput(startPracticeSchema, raw);
  if (!body.ok) return practiceFailure("bad-answer");

  try {
    const outcome = await startPracticeRound({ reset: body.data.reset });
    if (outcome.ok) return practiceReply(200, { ok: true, round: outcome.round });
    // An `in-progress` refusal carries the unfinished round, so the page can offer to resume it.
    return practiceFailure(outcome.reason, outcome.round);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return practiceReply(401, unauthenticated);
    logError({ operation: "practice.route.start", tenant: session.userId }, error);
    return practiceFailure("failed");
  }
}
