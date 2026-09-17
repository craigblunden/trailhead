import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  INTERVIEW_FAILURES,
  isComplete,
  isUnreached,
  rollUp,
  type Attempt,
  type InterviewFailure,
  type Scorecard,
  type TakeawayPoint,
} from "@/lib/interview";
import { UnauthenticatedError, requireSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import {
  completeAttempt,
  getAttempt,
  interviewSources,
  recordAnswer,
  storeScores,
} from "@/server/data/interview";
import { logError } from "@/server/log";

import { scoreAnswers, type ScoredAnswer } from "./claude";

/**
 * Answering an Attempt's questions, and scoring it once every question has an Answer (interview
 * simulator tickets 02, 03). The same division of responsibility as starting one
 * (`./start-attempt.ts`): the Route Handler maps an outcome to HTTP and this layer decides what the
 * outcome is.
 *
 * Neither of these touches the quota. An Attempt's cost was taken when it was started, and nothing
 * about answering or scoring it can raise or lower that — scoring is part of the Attempt the Tenant
 * already paid for, so a scoring failure they can retry never costs them a second one.
 */

export type AnswerOutcome =
  | { ok: true; attempt: Attempt }
  | { ok: false; reason: InterviewFailure; unexpected?: true };

/**
 * One Answer recorded against its question, with the seconds it consumed added to the Attempt's
 * active time. The Attempt completes on the last one.
 *
 * Recording the same question twice, or answering a finished Attempt, is `no-attempt`: an Answer is
 * what the Tenant said within that question's time, and a second submission would be a second run at
 * it. That, and not a client-side guard, is what makes the countdown mean something.
 */
export async function answerQuestion(
  attemptId: string,
  {
    questionId,
    transcript,
    elapsedSeconds,
  }: { questionId: string; transcript: string; elapsedSeconds: number },
): Promise<AnswerOutcome> {
  const { userId: tenant } = await requireSession();
  try {
    return {
      ok: true,
      attempt: await recordAnswer(attemptId, {
        questionId,
        transcript,
        elapsedSeconds,
      }),
    };
  } catch (error) {
    return failure(error, { tenant, operation: "interview.answer" });
  }
}

/**
 * The countdown ran out mid-question: the Attempt ends where it stands. What had been said on the
 * question on screen, if anything, is recorded as its Answer (interview second pass ticket 03); the
 * questions after it are unreached. The Attempt can then be scored on the Answers it has.
 */
export async function endAttempt(
  attemptId: string,
  partial?: { questionId: string; transcript: string },
): Promise<AnswerOutcome> {
  const { userId: tenant } = await requireSession();
  try {
    return { ok: true, attempt: await completeAttempt(attemptId, { partial }) };
  } catch (error) {
    return failure(error, { tenant, operation: "interview.end" });
  }
}

export type ScoreOutcome =
  | { ok: true; attempt: Attempt; scorecard: Scorecard }
  | { ok: false; reason: InterviewFailure; unexpected?: true };

/**
 * The Scorecard for a completed Attempt: every Answer's score, what landed, and Missed points, and a
 * Takeaway for the whole Attempt, from one scoring call (interview second pass ticket 05) — rolled up
 * per Category and into one overall score, then stored with the Attempt.
 *
 * An Attempt that is neither finished nor out of time cannot be scored — half a Scorecard would say
 * nothing useful about how the rehearsal went. An Attempt that ran out of time can, and only its
 * Answers go to the scorer (interview second pass ticket 03): an unreached question has nothing to
 * mark, so the app gives it 0 with no rationale and the rollup weighs it at half. An Attempt with no
 * Answer at all is scored without a call. A question reached and left empty is still an Answer.
 */
export async function scoreAttempt(
  attemptId: string,
  { client }: { client: Anthropic | null },
): Promise<ScoreOutcome> {
  const { userId: tenant } = await requireSession();

  try {
    const attempt = await getAttempt(attemptId);
    if (!attempt.completedAt && !isComplete(attempt)) {
      throw new RuleError("incomplete", INTERVIEW_FAILURES.incomplete);
    }

    const questions = [...attempt.questions].sort((a, b) => a.order - b.order);
    const answered = questions.filter((question) => !isUnreached(question));

    let scores: ScoredAnswer[] = [];
    let takeaway: TakeawayPoint[] = [];
    if (answered.length > 0) {
      if (!client) return { ok: false, reason: "unavailable" };
      const sources = await interviewSources(attempt.jobId);
      const outcome = await scoreAnswers(
        {
          ...sources,
          answers: answered.map((question) => ({
            category: question.category,
            question: question.text,
            transcript: question.answer?.transcript ?? "",
          })),
        },
        { client, tenant },
      );
      // A scoring failure costs the Tenant nothing: the Attempt is already paid for, its Answers are
      // still stored, and scoring it again spends no quota. So a failure is passed on as it is.
      if (!outcome.ok) return { ok: false, reason: outcome.reason };
      scores = outcome.scores;
      takeaway = outcome.takeaway;
    }

    const scoreFor = new Map(answered.map((question, index) => [question.id, scores[index]]));
    const scored = questions.map((question) => {
      const given = scoreFor.get(question.id);
      return given
        ? { ...question, answer: { transcript: question.answer?.transcript ?? "", rationale: "", ...given } }
        : question;
    });
    const scorecard = rollUp(scored);
    const stored = await storeScores(attemptId, {
      // An unreached question is given 0 and nothing to say by the app, never by the scorer.
      scores: questions.map((question) => ({
        questionId: question.id,
        score: scoreFor.get(question.id)?.score ?? 0,
        whatLanded: scoreFor.get(question.id)?.whatLanded ?? "",
        missedPoints: scoreFor.get(question.id)?.missedPoints ?? [],
      })),
      overall: scorecard.overall,
      takeaway,
    });
    return { ok: true, attempt: stored, scorecard };
  } catch (error) {
    return failure(error, { tenant, operation: "interview.score" });
  }
}

/** What a thrown error means as an outcome. Only the two a caller answers as 401 and 404 escape. */
function failure(
  error: unknown,
  { tenant, operation }: { tenant: string; operation: string },
): { ok: false; reason: InterviewFailure; unexpected?: true } {
  if (error instanceof UnauthenticatedError || error instanceof NotFoundError)
    throw error;
  if (error instanceof RuleError && error.code in INTERVIEW_FAILURES) {
    return { ok: false, reason: error.code as InterviewFailure };
  }
  logError({ operation, tenant }, error);
  return { ok: false, reason: "failed", unexpected: true };
}
