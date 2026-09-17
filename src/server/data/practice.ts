import "server-only";

import {
  PRACTICE_FAILURES,
  PRACTICE_SECONDS,
  canStartPracticeRound,
  pickPracticeQuestions,
  type PracticeRound,
} from "@/lib/practice";
import { requireSession } from "@/server/auth/session";
import { toPracticeRoundDto } from "@/server/db/mappers";
import { withTenant } from "@/server/db/tenant";

import { RuleError } from "./errors";
import { planOf } from "./plans";

/**
 * The data access layer for Practice rounds (practice round ticket 03, ADR-0006). It persists a round,
 * the questions picked for it, and the Answers recorded against them — and nothing else. No quota is
 * read or written: a Practice round calls no model and no Limit counts it. As with an Attempt, no audio
 * is ever stored, because none reaches the server.
 *
 * The answering rules are the Attempt's (`./interview.ts`), kept identical on purpose — the run screen
 * cannot tell which it is driving:
 * - **An Answer and the seconds it took land in one transaction**, and the round completes on the last.
 * - **A question is answered once**; answering a finished round is refused.
 * - **Time running out keeps what was half-said** on the question on screen, spends the whole
 *   countdown, and is idempotent.
 *
 * A missing round and another Tenant's are the same `no-round` refusal, so the answer never confirms
 * that a row exists.
 */

const ROUND_INCLUDE = { questions: true } as const;

const noRound = () => new RuleError("no-round", PRACTICE_FAILURES["no-round"]);

export type OpenedRound =
  | { ok: true; round: PracticeRound }
  | { ok: false; reason: "has-simulator" }
  | { ok: false; reason: "in-progress"; round: PracticeRound };

/**
 * Starts a Practice round, in one transaction with the Plan it is allowed on:
 * - a Plan with the full Simulator is refused (`has-simulator`) and nothing is written;
 * - an unfinished round is handed back (`in-progress`) rather than replaced — unless `reset`, which
 *   discards it (it cost nothing, so there is nothing to protect);
 * - the new round's questions prefer ones the Tenant's newest round, finished or discarded, did not ask.
 */
export async function openPracticeRound({ reset }: { reset: boolean }): Promise<OpenedRound> {
  const { userId } = await requireSession();
  return withTenant(userId, async (tx, tenant) => {
    if (!canStartPracticeRound(await planOf(tenant))) return { ok: false, reason: "has-simulator" };

    const newest = await tx.practiceRound.findFirst({
      where: { userId },
      include: ROUND_INCLUDE,
      orderBy: { startedAt: "desc" },
    });
    if (newest && !newest.completedAt && !reset) {
      return { ok: false, reason: "in-progress", round: toPracticeRoundDto(newest) };
    }
    // Only ever one unfinished round: a reset discards it, its questions going with it.
    if (reset) await tx.practiceRound.deleteMany({ where: { userId, completedAt: null } });

    const picked = pickPracticeQuestions(newest?.questions.map((question) => question.text) ?? []);
    const row = await tx.practiceRound.create({
      data: {
        userId,
        questions: {
          create: picked.map((question, order) => ({ userId, category: question.category, order, text: question.text })),
        },
      },
      include: ROUND_INCLUDE,
    });
    return { ok: true, round: toPracticeRoundDto(row) };
  });
}

/**
 * One Answer, recorded against its question, with the seconds it consumed added to the round's active
 * time — in one transaction. The round completes here when this was its last unanswered question.
 */
export async function recordPracticeAnswer(
  roundId: string,
  { questionId, transcript, elapsedSeconds, now = new Date() }: {
    questionId: string;
    transcript: string;
    elapsedSeconds: number;
    now?: Date;
  },
): Promise<PracticeRound> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const round = await tx.practiceRound.findFirst({ where: { id: roundId, userId }, include: ROUND_INCLUDE });
    if (!round || round.completedAt) throw noRound();
    const question = round.questions.find((candidate) => candidate.id === questionId);
    if (!question || question.answeredAt) throw noRound();

    await tx.practiceQuestion.update({ where: { id: question.id, userId }, data: { transcript, answeredAt: now } });
    const last = round.questions.every((candidate) => candidate.id === question.id || candidate.answeredAt);
    return tx.practiceRound.update({
      where: { id: round.id, userId },
      data: {
        activeSeconds: { increment: Math.max(Math.round(elapsedSeconds), 0) },
        ...(last ? { completedAt: now } : {}),
      },
      include: ROUND_INCLUDE,
    });
  });
  return toPracticeRoundDto(row);
}

/**
 * The countdown ran out mid-question: the round ends where it stands. What had been said on the question
 * on screen is kept as its Answer; with nothing said, or a question that is not this round's or already
 * answered, nothing is — the round must still end. Ending a finished round changes nothing.
 */
export async function completePracticeRound(
  roundId: string,
  { partial, now = new Date() }: { partial?: { questionId: string; transcript: string }; now?: Date } = {},
): Promise<PracticeRound> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const round = await tx.practiceRound.findFirst({ where: { id: roundId, userId }, include: ROUND_INCLUDE });
    if (!round) throw noRound();
    if (round.completedAt) return round;
    const onScreen = partial && round.questions.find((question) => question.id === partial.questionId);
    if (onScreen && !onScreen.answeredAt && partial.transcript.trim()) {
      await tx.practiceQuestion.update({
        where: { id: onScreen.id, userId },
        data: { transcript: partial.transcript, answeredAt: now },
      });
    }
    return tx.practiceRound.update({
      where: { id: round.id, userId },
      data: { completedAt: now, activeSeconds: PRACTICE_SECONDS },
      include: ROUND_INCLUDE,
    });
  });
  return toPracticeRoundDto(row);
}

/** The Tenant's unfinished Practice round, if there is one — what the page offers to resume. */
export async function unfinishedPracticeRound(): Promise<PracticeRound | null> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.practiceRound.findFirst({
      where: { userId, completedAt: null },
      include: ROUND_INCLUDE,
      orderBy: { startedAt: "desc" },
    }),
  );
  return row ? toPracticeRoundDto(row) : null;
}
