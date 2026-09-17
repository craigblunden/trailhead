import { beforeEach, describe, expect, it } from "vitest";

import { signInAs } from "./session-mock";

import { nextQuestion, secondsLeft } from "@/lib/interview";
import { PRACTICE_QUESTIONS, PRACTICE_SECONDS, type PracticeRound } from "@/lib/practice";
import { interviewQuota } from "@/server/data/interview";
import { finishedPracticeRound, finishedPracticeRounds } from "@/server/data/practice";
import { withTenant } from "@/server/db/tenant";
import { answerPracticeQuestion, endPracticeRound, startPracticeRound } from "@/server/interview/practice-round";

import { newUserId, resetTables, setPlan } from "./helpers";

/**
 * A Practice round's orchestration against the real database (practice round ticket 03). Nothing is
 * mocked but the session: the Plan check, the persisted questions, the Answers, and the active-time
 * accounting all run for real, under the real policies. No Claude client exists anywhere here — a
 * Practice round never needs one.
 */

beforeEach(async () => {
  await resetTables();
});

/** A signed-in Tenant on `plan`. A Tenant with no Plan row is on `free`. */
async function tenantOn(plan: "free" | "basic" | "pro" = "free") {
  const userId = newUserId();
  if (plan !== "free") await setPlan(userId, plan);
  signInAs(userId);
  return userId;
}

async function started(reset = false): Promise<PracticeRound> {
  const outcome = await startPracticeRound({ reset });
  if (!outcome.ok) throw new Error(`expected a started round, got ${outcome.reason}`);
  return outcome.round;
}

describe("starting a Practice round (practice round ticket 03)", () => {
  it("PRI-1: a free Tenant gets four questions from the fixed set — two personal, then two behavioural — on an eight-minute clock", async () => {
    await tenantOn("free");

    const round = await started();

    expect(round.questions.map((question) => [question.order, question.category])).toEqual([
      [0, "personal"],
      [1, "personal"],
      [2, "behavioural"],
      [3, "behavioural"],
    ]);
    for (const question of round.questions) {
      expect(PRACTICE_QUESTIONS[question.category]).toContain(question.text);
      expect(question.answer).toBeUndefined();
    }
    expect(round.countdownSeconds).toBe(PRACTICE_SECONDS);
    expect(secondsLeft(round)).toBe(480);
    expect(round.completedAt).toBeNull();
  });

  it("PRI-2: a basic Tenant can start one too, and it takes nothing from the week's interviews", async () => {
    await tenantOn("basic");

    await started();

    expect((await interviewQuota()).used).toBe(0);
  });

  it("PRI-3: a pro Tenant, who has the full Simulator, is refused and nothing is stored", async () => {
    const userId = await tenantOn("pro");

    const outcome = await startPracticeRound({ reset: false });

    expect(outcome).toEqual({ ok: false, reason: "has-simulator" });
    expect(await withTenant(userId, (tx) => tx.practiceRound.count())).toBe(0);
  });

  it("PRI-4: an unfinished round is offered back rather than replaced, and a reset discards it for a fresh one", async () => {
    const userId = await tenantOn();
    const first = await started();

    const again = await startPracticeRound({ reset: false });
    expect(again).toMatchObject({ ok: false, reason: "in-progress", round: { id: first.id } });

    const fresh = await started(true);
    expect(fresh.id).not.toBe(first.id);
    expect(await withTenant(userId, (tx) => tx.practiceRound.findMany({ select: { id: true } }))).toEqual([{ id: fresh.id }]);
    expect(await withTenant(userId, (tx) => tx.practiceQuestion.count())).toBe(4);
  });

  it("PRI-5: a finished round is kept, and the next one asks what the last one did not", async () => {
    const userId = await tenantOn();
    const first = await started();
    await endPracticeRound(first.id);

    const second = await started();

    const asked = new Set(first.questions.map((question) => question.text));
    expect(second.questions.some((question) => asked.has(question.text))).toBe(false);
    expect(await withTenant(userId, (tx) => tx.practiceRound.count())).toBe(2);
  });
});

describe("answering a Practice round (practice round ticket 03)", () => {
  it("PRI-6: each Answer is kept against its question with the seconds it took, and the last one ends the round", async () => {
    await tenantOn();
    const round = await started();

    let latest = round;
    for (const [index, question] of round.questions.entries()) {
      const outcome = await answerPracticeQuestion(round.id, {
        questionId: question.id,
        transcript: `Answer ${index + 1}.`,
        elapsedSeconds: 30,
      });
      if (!outcome.ok) throw new Error(outcome.reason);
      latest = outcome.round;
      if (index === 0) {
        expect(latest.activeSeconds).toBe(30);
        expect(nextQuestion(latest)?.id).toBe(round.questions[1].id);
        expect(latest.completedAt).toBeNull();
      }
    }

    expect(latest.questions.map((question) => question.answer?.transcript)).toEqual([
      "Answer 1.",
      "Answer 2.",
      "Answer 3.",
      "Answer 4.",
    ]);
    expect(latest.activeSeconds).toBe(120);
    expect(latest.completedAt).not.toBeNull();
  });

  it("PRI-7: a second Answer to the same question, or any Answer to a finished round, is refused", async () => {
    await tenantOn();
    const round = await started();
    const [first, second] = round.questions;
    await answerPracticeQuestion(round.id, { questionId: first.id, transcript: "Once.", elapsedSeconds: 10 });

    expect(
      await answerPracticeQuestion(round.id, { questionId: first.id, transcript: "Twice.", elapsedSeconds: 10 }),
    ).toEqual({ ok: false, reason: "no-round" });

    await endPracticeRound(round.id);
    expect(
      await answerPracticeQuestion(round.id, { questionId: second.id, transcript: "Late.", elapsedSeconds: 10 }),
    ).toEqual({ ok: false, reason: "no-round" });
  });

  it("PRI-8: time running out keeps what was half-said, leaves the rest unreached, and spends the whole clock — once", async () => {
    await tenantOn();
    const round = await started();
    const [first, second] = round.questions;
    await answerPracticeQuestion(round.id, { questionId: first.id, transcript: "Finished one.", elapsedSeconds: 200 });

    const ended = await endPracticeRound(round.id, { questionId: second.id, transcript: "Half of my sec" });
    if (!ended.ok) throw new Error(ended.reason);

    expect(ended.round.questions.map((question) => question.answer?.transcript)).toEqual([
      "Finished one.",
      "Half of my sec",
      undefined,
      undefined,
    ]);
    expect(secondsLeft(ended.round)).toBe(0);
    expect(ended.round.completedAt).not.toBeNull();

    const twice = await endPracticeRound(round.id, { questionId: round.questions[2].id, transcript: "Too late" });
    expect(twice.ok && twice.round.questions[2].answer).toBeUndefined();
    expect(twice.ok && twice.round.completedAt).toBe(ended.round.completedAt);
  });

  it("PRI-9: another Tenant's round cannot be answered or ended, and says only that there is no such round", async () => {
    await tenantOn();
    const round = await started();

    await tenantOn();
    expect(
      await answerPracticeQuestion(round.id, { questionId: round.questions[0].id, transcript: "Mine now.", elapsedSeconds: 5 }),
    ).toEqual({ ok: false, reason: "no-round" });
    expect(await endPracticeRound(round.id)).toEqual({ ok: false, reason: "no-round" });
  });
});

describe("saved Practice rounds (practice round ticket 05)", () => {
  it("PRI-10: the list is every finished round, newest first, with how many were answered — never the unfinished one", async () => {
    await tenantOn();
    const first = await started();
    await answerPracticeQuestion(first.id, { questionId: first.questions[0].id, transcript: "One.", elapsedSeconds: 5 });
    await endPracticeRound(first.id);
    const second = await started();
    await endPracticeRound(second.id);
    await started(); // unfinished

    const list = await finishedPracticeRounds();

    expect(list.map((row) => [row.id, row.answered])).toEqual([
      [second.id, 0],
      [first.id, 1],
    ]);
    expect(list[0].startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("PRI-11: a finished round opens as it was; an unfinished, unknown, or foreign one is nothing", async () => {
    await tenantOn();
    const round = await started();
    await answerPracticeQuestion(round.id, { questionId: round.questions[0].id, transcript: "Kept.", elapsedSeconds: 5 });
    expect(await finishedPracticeRound(round.id)).toBeNull();

    await endPracticeRound(round.id);
    const opened = await finishedPracticeRound(round.id);
    expect(opened?.questions[0].answer?.transcript).toBe("Kept.");
    expect(await finishedPracticeRound("round-that-never-was")).toBeNull();

    await tenantOn();
    expect(await finishedPracticeRound(round.id)).toBeNull();
    expect(await finishedPracticeRounds()).toEqual([]);
  });

  it("PRI-12: a Tenant moved to pro still has the rounds taken before", async () => {
    const userId = await tenantOn();
    const round = await started();
    await endPracticeRound(round.id);

    await setPlan(userId, "pro");

    expect((await finishedPracticeRounds()).map((row) => row.id)).toEqual([round.id]);
    expect(await finishedPracticeRound(round.id)).not.toBeNull();
  });
});
