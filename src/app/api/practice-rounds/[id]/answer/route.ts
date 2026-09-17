import { parseId } from "@/server/action-result";
import { getOptionalSession, UnauthenticatedError } from "@/server/auth/session";
import { answerPracticeQuestion, endPracticeRound } from "@/server/interview/practice-round";
import { practiceFailure, practiceReply, unauthenticated } from "@/server/interview/reply";
import { logError } from "@/server/log";
import { parseInput, recordAnswerSchema, timeUpSchema } from "@/server/validation";

/**
 * POST /api/practice-rounds/:id/answer — records one Answer against a Practice round's question and adds
 * the seconds it took to the round's active time (practice round ticket 03). With no body, or a
 * `timeUp` body, it is the countdown running out instead: the round ends where it stands, keeping what
 * was said on the question on screen. The same bodies, and the same rules, as an Attempt's answer route.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return practiceReply(401, unauthenticated);

  // A malformed id is answered exactly as a missing or foreign round is.
  const round = parseId((await params).id, "practice round");
  if (!round.ok) return practiceFailure("no-round");

  const raw = await request.text().catch(() => null);
  if (raw === null) return practiceFailure("bad-answer");

  try {
    const outcome = raw.trim() === "" ? await endPracticeRound(round.id) : await recordFrom(raw, round.id);
    if (outcome === null) return practiceFailure("bad-answer");
    if (outcome.ok) return practiceReply(200, { ok: true, round: outcome.round });
    return practiceFailure(outcome.reason);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return practiceReply(401, unauthenticated);
    logError({ operation: "practice.route.answer", tenant: session.userId }, error);
    return practiceFailure("failed");
  }
}

/** The Answer, or the countdown running out mid-answer, in the body; null when the body is neither. */
async function recordFrom(raw: string, roundId: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (json && typeof json === "object" && "timeUp" in json) {
    const body = parseInput(timeUpSchema, json);
    return body.ok ? endPracticeRound(roundId, { questionId: body.data.questionId, transcript: body.data.transcript }) : null;
  }
  const body = parseInput(recordAnswerSchema, json);
  return body.ok ? answerPracticeQuestion(roundId, body.data) : null;
}
