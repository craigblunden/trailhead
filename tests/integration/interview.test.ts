import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import {
  CATEGORIES,
  ATTEMPT_LENGTHS,
  CATEGORY_MIX,
  attemptSeconds,
  nextQuestion,
  remainingSeconds,
  rollUp,
  type AttemptLength,
  type Category,
  type KnownLength,
} from "@/lib/interview";
import { PLAN_LIMITS } from "@/lib/plans";
import { setJobDocument } from "@/server/data/documents";
import { earlierQuestions, interviewQuota, latestAttempt, pastAttempts, scoredAttempt } from "@/server/data/interview";
import { createJob } from "@/server/data/jobs";
import { withTenant } from "@/server/db/tenant";
import { answerQuestion, endAttempt, scoreAttempt } from "@/server/interview/answer-attempt";
import { INTERVIEW_MODEL } from "@/server/interview/claude";
import { startAttempt } from "@/server/interview/start-attempt";

import { newUserId, resetTables, setPlan } from "./helpers";

/**
 * The Interview Simulator's orchestration layer against the real database (interview simulator
 * tickets 01–05). Nothing is mocked but the session: the Claude call goes through a real SDK client
 * — the seam the orchestration takes — to a local fake of the Messages API, so every other layer
 * runs for real: the quota upsert, the policies, the refunds, the persisted question set, the
 * Answers, and the active-time accounting.
 */
type Reply = { status?: number; delayMs?: number; body: unknown };

let reply: Reply;
let requests = 0;
/** The prompt each request carried, in order, so a test can read what reached the call. */
let prompts: string[] = [];
let server: Server;
let baseURL: string;

const message = (overrides: Record<string, unknown>) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: INTERVIEW_MODEL,
  content: [],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 900, output_tokens: 400 },
  ...overrides,
});

const answer = (object: Record<string, unknown>) =>
  message({ content: [{ type: "text", text: JSON.stringify(object) }] });

/** A question set with exactly the mix the length's table asks for. */
const questionSet = (length: AttemptLength) =>
  CATEGORIES.flatMap((category) =>
    Array.from({ length: CATEGORY_MIX[length][category] }, (_, index) => ({
      category,
      text: `A ${category} question ${index + 1}?`,
    })),
  );

const QUESTIONS = (length: AttemptLength = 15) => answer({ questions: questionSet(length) });

/** The scorer's answer: per Answer a score, what landed, and Missed points, and a Takeaway for them all. */
const SCORES = (values: number[]) =>
  answer({
    scores: values.map((score, index) => ({
      score,
      whatLanded: `Answer ${index + 1} landed.`,
      missedPoints: [`Missed point ${index + 1}.`],
    })),
    takeaway: [
      { point: "Say what came of the work.", from: "every answer" },
      { point: "Lead with the referral loop.", from: "your design answer" },
    ],
  });

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      requests += 1;
      prompts.push(String((JSON.parse(raw || "{}") as { messages?: { content?: unknown }[] }).messages?.[0]?.content ?? ""));
      setTimeout(() => {
        if (response.destroyed) return;
        response.writeHead(reply.status ?? 200, { "content-type": "application/json" });
        response.end(JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const claude = (timeout = 5_000) => new Anthropic({ apiKey: "test-key", baseURL, maxRetries: 0, timeout });

const MONDAY = new Date("2026-07-20T09:00:00.000Z");

/** A `pro` Tenant with a Job that has both a description and a ready resume. */
async function proTenantWithJob(description = "Own onboarding, pricing, and the referral loop.") {
  const userId = newUserId();
  await setPlan(userId, "pro");
  signInAs(userId);
  const job = await createJob(
    {
      company: "Fernwood",
      role: "Product Designer",
      location: "Remote",
      salaryMin: null,
      salaryMax: null,
      postingUrl: "",
      description,
    },
    MONDAY,
  );
  const resume = await withTenant(userId, (tx) =>
    tx.document.create({
      data: {
        userId,
        kind: "resume",
        fileName: "resume.pdf",
        storageKey: `${userId}/${crypto.randomUUID()}.pdf`,
        mimeType: "application/pdf",
        text: "Sam Rivera — Senior Product Designer.",
        ingestion: "ready",
      },
    }),
  );
  await setJobDocument(job.id, "resume", resume.id);
  return { userId, jobId: job.id };
}

const start = (jobId: string, length: KnownLength = 15, reset = false) =>
  startAttempt(jobId, { client: claude(), length, reset });

const usedThisWeek = (userId: string) =>
  withTenant(userId, async (tx) => (await tx.interviewQuota.findFirst({ select: { used: true } }))?.used ?? 0);

/** Answers every question of an Attempt, `seconds` each. */
async function answerAll(attemptId: string, questions: { id: string }[], seconds = 10) {
  let last;
  for (const question of questions) {
    last = await answerQuestion(attemptId, {
      questionId: question.id,
      transcript: `An answer to ${question.id}.`,
      elapsedSeconds: seconds,
    });
  }
  return last;
}

beforeEach(async () => {
  await resetTables();
  signOut();
  reply = { body: QUESTIONS() };
  requests = 0;
  prompts = [];
  vi.restoreAllMocks();
});

describe("ticket 01: starting an Attempt", () => {
  it("persists a question set spanning all five Categories, in order, and counts one Attempt against the week", async () => {
    const { userId, jobId } = await proTenantWithJob();

    const outcome = await start(jobId);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.attempt.questions).toHaveLength(5);
    expect(outcome.attempt.questions.map((question) => question.order)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(outcome.attempt.questions.map((question) => question.category))).toEqual(new Set(CATEGORIES));
    expect(outcome.attempt.length).toBe(15);
    expect(outcome.attempt.completedAt).toBeNull();
    expect(await usedThisWeek(userId)).toBe(1);
    expect(outcome.quota).toMatchObject({ limit: PLAN_LIMITS.pro.interviewsPerWeek, used: 1, remaining: 9 });
  });

  it("shows exactly the questions originally generated on reload — nothing is regenerated", async () => {
    const { jobId } = await proTenantWithJob();
    const outcome = await start(jobId);
    if (!outcome.ok) throw new Error("expected a started Attempt");

    // A second call to the fake would return a different set; reading the Attempt back makes none.
    const callsAfterStart = requests;
    const reloaded = await latestAttempt(jobId);

    expect(requests).toBe(callsAfterStart);
    expect(reloaded?.questions).toEqual(outcome.attempt.questions);
  });

  it("each length persists its own Category mix", async () => {
    for (const length of ATTEMPT_LENGTHS) {
      const { jobId } = await proTenantWithJob();
      reply = { body: QUESTIONS(length) };

      const outcome = await start(jobId, length);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      for (const category of CATEGORIES) {
        const count = outcome.attempt.questions.filter((question) => question.category === category).length;
        expect(count, `${length}m ${category}`).toBe(CATEGORY_MIX[length][category as Category]);
      }
    }
  });

  it("refuses a Job with no resume, and one with no description, before any quota is taken", async () => {
    const { userId, jobId } = await proTenantWithJob("");
    expect(await start(jobId)).toMatchObject({ ok: false, reason: "no-description", refunded: false });

    const noResume = await withTenant(userId, (tx) => tx.job.create({
      data: { userId, company: "Harvest", role: "Designer", location: "Remote", addedOn: MONDAY, accent: "moss", description: "A real posting." },
    }));
    expect(await start(noResume.id)).toMatchObject({ ok: false, reason: "no-resume", refunded: false });

    expect(await usedThisWeek(userId)).toBe(0);
    expect(requests).toBe(0);
  });

  it("refuses a Tenant who is not on pro, and one asking for a length their Plan does not offer", async () => {
    const { userId, jobId } = await proTenantWithJob();
    await setPlan(userId, "basic");

    expect(await start(jobId)).toMatchObject({ ok: false, reason: "not-pro" });
    expect(await usedThisWeek(userId)).toBe(0);
    expect(requests).toBe(0);

    await setPlan(userId, "pro");
    // `pro` chooses between all three; a fourth length never reaches the call.
    expect(await start(jobId, 45 as KnownLength)).toMatchObject({ ok: false, reason: "bad-length" });
    // Nor does a retired one: an Attempt can no longer be started at 5 or 10 minutes (interview
    // second pass ticket 04).
    for (const retired of [5, 10] as const) {
      expect(await start(jobId, retired)).toMatchObject({ ok: false, reason: "bad-length" });
    }
    expect(requests).toBe(0);
    expect(await usedThisWeek(userId)).toBe(0);
  });
});

describe("interview second pass ticket 07: new questions on a repeat Attempt", () => {
  /** A question set whose every question names the Attempt it was written for. */
  const labelled = (label: string) =>
    answer({ questions: questionSet(15).map((question) => ({ ...question, text: `${label}: a ${question.category} question?` })) });

  it("a first Attempt's call carries no history; a repeat Attempt's carries the questions of this Job's three most recent earlier Attempts, newest first", async () => {
    const { jobId } = await proTenantWithJob();

    for (const label of ["First", "Second", "Third", "Fourth"]) {
      reply = { body: labelled(label) };
      // Each earlier Attempt is abandoned for the next: reset ones count as asked, like any other.
      expect(await start(jobId, 15, label !== "First")).toMatchObject({ ok: true });
    }
    expect(prompts[0]).not.toContain("<earlier_questions>");

    reply = { body: QUESTIONS() };
    expect(await start(jobId, 15, true)).toMatchObject({ ok: true });

    const last = prompts[prompts.length - 1];
    const block = /<earlier_questions>\n([\s\S]*?)\n<\/earlier_questions>/.exec(last)?.[1] ?? "";
    expect(block).toContain("- Fourth: a personal question?");
    expect(block).toContain("- Second: a design question?");
    expect(block.indexOf("Fourth:")).toBeLessThan(block.indexOf("Third:"));
    expect(block.indexOf("Third:")).toBeLessThan(block.indexOf("Second:"));
    // Only three: the oldest is left out.
    expect(block).not.toContain("First:");
  });

  it("reads earlier questions for one Job only, in the order they were asked", async () => {
    const { userId, jobId } = await proTenantWithJob();
    reply = { body: labelled("This job") };
    await start(jobId);
    const other = await createJob(
      { company: "Harvest", role: "Researcher", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "A posting." },
      MONDAY,
    );
    await withTenant(userId, (tx) =>
      tx.attempt.create({
        data: { userId, jobId: other.id, length: 15, questions: { create: [{ userId, category: "personal", order: 0, text: "Another job?" }] } },
      }),
    );

    const earlier = await earlierQuestions(jobId);

    expect(earlier).toHaveLength(1);
    expect(earlier[0]).toEqual(questionSet(15).map((question) => `This job: a ${question.category} question?`));
  });
});

describe("ticket 01: the weekly quota, reserved and given back", () => {
  it("allows a pro Tenant ten Attempts a week, reserved atomically even when requests race", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const limit = PLAN_LIMITS.pro.interviewsPerWeek as number;

    // Each start is for its own Job, so the in-progress rule does not get in the way of the race.
    const jobs = [jobId];
    for (let index = 1; index < limit + 2; index += 1) {
      const job = await withTenant(userId, (tx) => tx.job.create({
        data: { userId, company: `Company ${index}`, role: "Designer", location: "Remote", addedOn: MONDAY, accent: "moss", description: "A real posting.", resumeId: null },
      }));
      jobs.push(job.id);
    }
    // Every Job needs the resume the questions are drawn from.
    const resume = await withTenant(userId, (tx) => tx.document.findFirstOrThrow({ select: { id: true } }));
    for (const job of jobs.slice(1)) await setJobDocument(job, "resume", resume.id);

    const outcomes = await Promise.all(jobs.map((job) => start(job)));

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(limit);
    expect(outcomes.filter((outcome) => !outcome.ok && outcome.reason === "quota")).toHaveLength(jobs.length - limit);
    expect(await usedThisWeek(userId)).toBe(limit);
    expect(await interviewQuota()).toMatchObject({ used: limit, remaining: 0 });
  });

  it("gives the Attempt back when generation fails, times out, or comes back unfinished — and not when Claude refuses", async () => {
    const { userId, jobId } = await proTenantWithJob();

    const ours: Reply[] = [
      { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } },
      { body: message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"questions": [' }] }) },
      // A set that does not span the five Categories is malformed, and ours to give back.
      { body: answer({ questions: questionSet(15).slice(0, 3) }) },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const failure of ours) {
      reply = failure;
      expect(await start(jobId)).toMatchObject({ ok: false, refunded: true });
      expect(await usedThisWeek(userId)).toBe(0);
    }

    reply = { delayMs: 1_000, body: QUESTIONS() };
    expect(await startAttempt(jobId, { client: claude(200), length: 15 })).toMatchObject({
      ok: false,
      reason: "timed-out",
      refunded: true,
    });
    expect(await usedThisWeek(userId)).toBe(0);

    // A refusal is the one failure the Tenant's own material can cause: it stays counted.
    reply = { body: message({ stop_reason: "refusal", stop_details: { type: "refusal", category: null } }) };
    expect(await start(jobId)).toMatchObject({ ok: false, reason: "refused", refunded: false });
    expect(await usedThisWeek(userId)).toBe(1);
  });

  it("never gives an Attempt back for being abandoned: a delivered question set is a used Attempt", async () => {
    const { userId, jobId } = await proTenantWithJob();

    const outcome = await start(jobId);
    expect(outcome.ok).toBe(true);
    // The Tenant walks away and comes back days later; the count is unchanged.
    expect(await usedThisWeek(userId)).toBe(1);
    expect(await interviewQuota()).toMatchObject({ used: 1, remaining: 9 });
  });
});

describe("ticket 02: answering, the clock, and completion", () => {
  it("records each Answer against its question and adds the seconds it took to the Attempt's active time", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [first, second] = started.attempt.questions;

    const afterFirst = await answerQuestion(started.attempt.id, {
      questionId: first.id,
      transcript: "I led the reporting redesign.",
      elapsedSeconds: 45,
    });

    expect(afterFirst.ok).toBe(true);
    if (!afterFirst.ok) return;
    expect(afterFirst.attempt.questions[0].answer?.transcript).toBe("I led the reporting redesign.");
    expect(afterFirst.attempt.activeSeconds).toBe(45);
    expect(remainingSeconds(afterFirst.attempt)).toBe(attemptSeconds(15) - 45);
    // The pause between questions is untimed: nothing but a submitted Answer moves the clock.
    expect(nextQuestion(afterFirst.attempt)?.id).toBe(second.id);
    expect(afterFirst.attempt.completedAt).toBeNull();
  });

  it("completes the Attempt once every question has an Answer", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");

    const last = await answerAll(started.attempt.id, started.attempt.questions, 20);

    expect(last?.ok).toBe(true);
    if (!last?.ok) return;
    expect(last.attempt.completedAt).not.toBeNull();
    expect(last.attempt.activeSeconds).toBe(100);
    expect(nextQuestion(last.attempt)).toBeUndefined();
  });

  it("refuses a second Answer to the same question, and any Answer to a finished Attempt", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [first] = started.attempt.questions;
    await answerQuestion(started.attempt.id, { questionId: first.id, transcript: "Once.", elapsedSeconds: 10 });

    expect(
      await answerQuestion(started.attempt.id, { questionId: first.id, transcript: "Twice.", elapsedSeconds: 10 }),
    ).toMatchObject({ ok: false, reason: "no-attempt" });

    await answerAll(started.attempt.id, started.attempt.questions.slice(1), 10);
    expect(
      await answerQuestion(started.attempt.id, {
        questionId: started.attempt.questions[1].id,
        transcript: "After the end.",
        elapsedSeconds: 10,
      }),
    ).toMatchObject({ ok: false, reason: "no-attempt" });

    // The first Answer stands, unchanged by either attempt to overwrite it.
    const stored = await latestAttempt(jobId);
    expect(stored?.questions[0].answer?.transcript).toBe("Once.");
  });

  it("the countdown running out keeps what was half-said on the question on screen as its Answer (interview second pass ticket 03)", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [first, second, third] = started.attempt.questions;
    await answerQuestion(started.attempt.id, { questionId: first.id, transcript: "Finished this one.", elapsedSeconds: 30 });

    const ended = await endAttempt(started.attempt.id, { questionId: second.id, transcript: "I was halfway through say" });

    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.attempt.completedAt).not.toBeNull();
    expect(remainingSeconds(ended.attempt)).toBe(0);
    expect(ended.attempt.questions[1].answer?.transcript).toBe("I was halfway through say");
    expect(ended.attempt.questions.slice(2).every((question) => !question.answer)).toBe(true);

    // Stored, and nothing half-said can be recorded against an Attempt that has already ended.
    expect((await latestAttempt(jobId))?.questions[1].answer?.transcript).toBe("I was halfway through say");
    const again = await endAttempt(started.attempt.id, { questionId: third.id, transcript: "Too late." });
    expect(again.ok && again.attempt.questions[2].answer).toBeFalsy();
  });

  it("the countdown running out with nothing said records nothing: the question on screen is unreached", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");

    const ended = await endAttempt(started.attempt.id, { questionId: started.attempt.questions[0].id, transcript: "" });

    expect(ended.ok && ended.attempt.questions.every((question) => !question.answer)).toBe(true);
  });

  it("the countdown running out ends the Attempt where it stands: nothing is force-submitted", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await answerQuestion(started.attempt.id, {
      questionId: started.attempt.questions[0].id,
      transcript: "The only one I finished.",
      elapsedSeconds: 30,
    });

    const ended = await endAttempt(started.attempt.id);

    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.attempt.completedAt).not.toBeNull();
    expect(remainingSeconds(ended.attempt)).toBe(0);
    expect(ended.attempt.questions.filter((question) => question.answer)).toHaveLength(1);
    // The four unanswered questions stay unanswered rather than being recorded empty.
    expect(ended.attempt.questions.slice(1).every((question) => !question.answer)).toBe(true);
  });
});

describe("ticket 04: resuming an interrupted Attempt, or resetting it", () => {
  it("resumes at the next unanswered question with the remaining budget exactly as it was left", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await answerQuestion(started.attempt.id, {
      questionId: started.attempt.questions[0].id,
      transcript: "Answered before the phone rang.",
      elapsedSeconds: 40,
    });

    // The tab closes mid-question 2 and the Tenant comes back later.
    const resumed = await latestAttempt(jobId);

    expect(resumed).not.toBeNull();
    if (!resumed) return;
    // Nothing drained while they were away: active time is only what was actually answered for.
    expect(resumed.activeSeconds).toBe(40);
    expect(remainingSeconds(resumed)).toBe(attemptSeconds(15) - 40);
    expect(nextQuestion(resumed)?.id).toBe(started.attempt.questions[1].id);
    // The question they were mid-way through carries no half-recorded Answer.
    expect(resumed.questions[1].answer).toBeUndefined();
    expect(resumed.questions).toEqual(started.attempt.questions.map((question, index) =>
      index === 0
        ? {
            ...question,
            answer: { transcript: "Answered before the phone rang.", score: null, whatLanded: "", missedPoints: [], rationale: "" },
          }
        : question,
    ));
  });

  it("will not silently start a second Attempt while one is unfinished: it offers the one in progress", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");

    const again = await start(jobId);

    expect(again).toMatchObject({ ok: false, reason: "in-progress" });
    expect(again.ok === false && again.attempt?.id).toBe(started.attempt.id);
    expect(await usedThisWeek(userId)).toBe(1);
  });

  it("resetting starts a fresh Attempt and costs another one from the week", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");

    const fresh = await start(jobId, 15, true);

    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.attempt.id).not.toBe(started.attempt.id);
    expect(await usedThisWeek(userId)).toBe(2);
    // The abandoned Attempt is left behind, not deleted; the newest one is what resumes.
    expect((await latestAttempt(jobId))?.id).toBe(fresh.attempt.id);
  });

  it("with no Attempts left, resetting is refused — so abandoning and restarting cannot bypass the Limit", async () => {
    const { userId, jobId } = await proTenantWithJob();
    await withTenant(userId, (tx) =>
      tx.interviewQuota.create({
        data: { userId, weekStart: new Date("2026-07-20T00:00:00.000Z"), used: PLAN_LIMITS.pro.interviewsPerWeek as number },
      }),
    );
    vi.setSystemTime(new Date("2026-07-22T09:00:00.000Z"));

    expect(await start(jobId, 15, true)).toMatchObject({ ok: false, reason: "quota", refunded: false });
    expect(requests).toBe(0);
    vi.useRealTimers();
  });
});

describe("interview second pass ticket 04: an Attempt started at a retired length", () => {
  it("still resumes on its own countdown and question set, still scores, and still carries its length", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    // Started before the lengths changed: five questions against a five-minute countdown.
    await withTenant(userId, (tx) => tx.attempt.update({ where: { id: started.attempt.id }, data: { length: 5 } }));
    await answerQuestion(started.attempt.id, {
      questionId: started.attempt.questions[0].id,
      transcript: "Answered before the lengths changed.",
      elapsedSeconds: 60,
    });

    const resumed = await latestAttempt(jobId);
    expect(resumed?.length).toBe(5);
    expect(remainingSeconds(resumed!)).toBe(attemptSeconds(5) - 60);
    expect(resumed?.questions.map((question) => question.id)).toEqual(started.attempt.questions.map((question) => question.id));

    await answerAll(started.attempt.id, started.attempt.questions.slice(1), 20);
    reply = { body: SCORES([70, 70, 70, 70, 70]) };
    const scored = await scoreAttempt(started.attempt.id, { client: claude() });

    expect(scored).toMatchObject({ ok: true, attempt: { length: 5, overallScore: 70 } });
  });
});

describe("ticket 03: scoring a completed Attempt", () => {
  const scores = (count: number, score = 70) => SCORES(Array.from({ length: count }, (_, index) => score + index));

  it("scores every Answer, rolls them up per Category and overall, and stores the lot", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await answerAll(started.attempt.id, started.attempt.questions, 20);

    reply = { body: scores(5) };
    const scored = await scoreAttempt(started.attempt.id, { client: claude() });

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    // 70..74 across five questions, one per Category.
    expect(scored.scorecard.overall).toBe(72);
    expect(scored.scorecard.categories).toHaveLength(CATEGORIES.length);
    for (const question of scored.attempt.questions) {
      expect(question.answer?.score).toBeGreaterThanOrEqual(70);
      expect(question.answer?.whatLanded).toMatch(/^Answer \d landed\.$/);
      expect(question.answer?.missedPoints).toEqual([expect.stringMatching(/^Missed point \d\.$/)]);
      expect(question.answer?.rationale).toBe("");
    }
    expect(scored.attempt.overallScore).toBe(72);
    expect(scored.attempt.takeaway).toHaveLength(2);

    // Stored, not just returned: reloading the Attempt shows the same Scorecard.
    const reloaded = await latestAttempt(jobId);
    expect(reloaded?.overallScore).toBe(72);
    expect(reloaded?.questions[0].answer?.score).toBe(70);
    // What landed, Missed points, and the Takeaway read back identically (interview second pass ticket 05).
    expect(reloaded?.questions).toEqual(scored.attempt.questions);
    expect(reloaded?.takeaway).toEqual([
      { point: "Say what came of the work.", from: "every answer" },
      { point: "Lead with the referral loop.", from: "your design answer" },
    ]);
  });

  it("refuses to score an Attempt that is not finished", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await answerQuestion(started.attempt.id, {
      questionId: started.attempt.questions[0].id,
      transcript: "Only the first.",
      elapsedSeconds: 10,
    });

    expect(await scoreAttempt(started.attempt.id, { client: claude() })).toMatchObject({
      ok: false,
      reason: "incomplete",
    });
    expect((await latestAttempt(jobId))?.overallScore).toBeNull();
  });

  it("scores an Attempt the clock ended by sending only its Answers: unreached questions get nothing from Claude and count at half weight (interview second pass ticket 03)", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [first, second, third] = started.attempt.questions;
    await answerQuestion(started.attempt.id, { questionId: first.id, transcript: "The first.", elapsedSeconds: 30 });
    // Reached with time left and submitted empty: still an Answer, scored at full weight.
    await answerQuestion(started.attempt.id, { questionId: second.id, transcript: "", elapsedSeconds: 30 });
    await endAttempt(started.attempt.id, { questionId: third.id, transcript: "Half an answ" });

    reply = { body: SCORES([80, 80, 80]) };
    prompts = [];
    const scored = await scoreAttempt(started.attempt.id, { client: claude() });

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    // Three Answers went to the scorer; the two unreached questions did not.
    expect(prompts).toHaveLength(1);
    expect(prompts[0].match(/<answer index="/g)).toHaveLength(3);
    expect(prompts[0]).toContain("<response>\nHalf an answ\n</response>");
    expect(prompts[0]).not.toContain(started.attempt.questions[3].text);
    // Three at 80, two unreached at half weight.
    expect(scored.scorecard.overall).toBe(60);
    expect(scored.attempt.overallScore).toBe(60);
    expect(scored.attempt.questions.slice(3).every((question) => !question.answer)).toBe(true);
    expect((await latestAttempt(jobId))?.overallScore).toBe(60);
  });

  it("scores an Attempt where every question was unreached without calling Claude at all", async () => {
    const { jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await endAttempt(started.attempt.id);
    prompts = [];

    const scored = await scoreAttempt(started.attempt.id, { client: claude() });

    expect(prompts).toHaveLength(0);
    expect(scored).toMatchObject({ ok: true, attempt: { overallScore: 0 }, scorecard: { overall: 0 } });
  });

  it("an Attempt scored before unreached questions were weighted reads under the new rule, with no call to rescore it", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [first, second, third] = started.attempt.questions;
    for (const question of [first, second, third]) {
      await answerQuestion(started.attempt.id, { questionId: question.id, transcript: "Answered.", elapsedSeconds: 30 });
    }
    await endAttempt(started.attempt.id);
    // As the first pass stored it: every question scored — the silences at the bottom of the scale — and
    // an overall that averaged them in at full weight.
    await withTenant(userId, async (tx) => {
      for (const question of started.attempt.questions) {
        const answered = [first.id, second.id, third.id].includes(question.id);
        await tx.attemptQuestion.update({
          where: { id: question.id },
          data: { score: answered ? 80 : 0, rationale: answered ? "Good." : "Nothing to score." },
        });
      }
      await tx.attempt.update({ where: { id: started.attempt.id }, data: { overallScore: 48 } });
    });
    prompts = [];

    const stored = await latestAttempt(jobId);

    expect(prompts).toHaveLength(0);
    // The two silences carry no Answer, so they are unreached — no score, no rationale on show.
    expect(stored?.questions.slice(3).every((question) => !question.answer)).toBe(true);
    // The answered ones keep their single rationale, with no What landed, Missed points, or Takeaway.
    expect(stored?.questions[0].answer).toMatchObject({ rationale: "Good.", whatLanded: "", missedPoints: [] });
    expect(stored?.takeaway).toEqual([]);
    expect(rollUp(stored!.questions).overall).toBe(60);
  });

  it("a scoring failure costs nothing and can be retried: the Attempt was counted when it was started", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    await answerAll(started.attempt.id, started.attempt.questions, 20);

    vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
    expect(await scoreAttempt(started.attempt.id, { client: claude() })).toMatchObject({ ok: false, reason: "failed" });
    expect(await usedThisWeek(userId)).toBe(1);

    reply = { body: scores(5) };
    expect(await scoreAttempt(started.attempt.id, { client: claude() })).toMatchObject({ ok: true });
    expect(await usedThisWeek(userId)).toBe(1);
  });
});

describe("interview second pass ticket 06: past interviews", () => {
  /** Answers every question of a started Attempt and scores it, each Answer at `score`. */
  async function finishAndScore(attemptId: string, questions: { id: string }[], score = 70) {
    await answerAll(attemptId, questions, 20);
    reply = { body: SCORES(questions.map(() => score)) };
    const scored = await scoreAttempt(attemptId, { client: claude() });
    if (!scored.ok) throw new Error("expected a scored Attempt");
    return scored.attempt;
  }

  it("lists scored Attempts across every Job and the one in progress, newest first — leaving out reset and never-scored ones", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const otherJob = await createJob(
      { company: "Harvest", role: "Researcher", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "A posting." },
      MONDAY,
    );
    const resume = await withTenant(userId, (tx) => tx.document.findFirst({ select: { id: true } }));
    await setJobDocument(otherJob.id, "resume", resume!.id);
    const startedAt = (minutes: number) => new Date(Date.UTC(2026, 8, 10, 9, minutes));
    const stamp = (id: string, minutes: number) =>
      withTenant(userId, (tx) => tx.attempt.update({ where: { id }, data: { startedAt: startedAt(minutes) } }));

    // Fernwood, oldest: scored.
    const first = await start(jobId);
    if (!first.ok) throw new Error("expected a started Attempt");
    await finishAndScore(first.attempt.id, first.attempt.questions, 80);
    await stamp(first.attempt.id, 0);
    // Harvest: finished but never scored — left out.
    reply = { body: QUESTIONS(20) };
    const unscored = await start(otherJob.id, 20);
    if (!unscored.ok) throw new Error("expected a started Attempt");
    await endAttempt(unscored.attempt.id);
    await stamp(unscored.attempt.id, 10);
    // Fernwood again: abandoned for a reset — left out — then the fresh one left in progress.
    reply = { body: QUESTIONS() };
    const abandoned = await start(jobId);
    if (!abandoned.ok) throw new Error("expected a started Attempt");
    await stamp(abandoned.attempt.id, 20);
    const inProgress = await start(jobId, 15, true);
    if (!inProgress.ok) throw new Error("expected a started Attempt");
    await stamp(inProgress.attempt.id, 30);

    const past = await pastAttempts();

    expect(past).toEqual([
      {
        id: inProgress.attempt.id,
        jobId,
        company: "Fernwood",
        role: "Product Designer",
        accent: expect.any(String),
        startedOn: "2026-09-10",
        length: 15,
        status: "in-progress",
        overall: null,
      },
      {
        id: first.attempt.id,
        jobId,
        company: "Fernwood",
        role: "Product Designer",
        accent: expect.any(String),
        startedOn: "2026-09-10",
        length: 15,
        status: "scored",
        overall: 80,
      },
    ]);
  });

  it("reads an Attempt scored before unreached questions were weighted at its recomputed overall", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const started = await start(jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const [a, b, c] = started.attempt.questions;
    for (const question of [a, b, c]) {
      await answerQuestion(started.attempt.id, { questionId: question.id, transcript: "Answered.", elapsedSeconds: 30 });
    }
    await endAttempt(started.attempt.id);
    await withTenant(userId, async (tx) => {
      for (const question of started.attempt.questions) {
        await tx.attemptQuestion.update({ where: { id: question.id }, data: { score: [a.id, b.id, c.id].includes(question.id) ? 80 : 0 } });
      }
      await tx.attempt.update({ where: { id: started.attempt.id }, data: { overallScore: 48 } });
    });

    expect((await pastAttempts())[0]).toMatchObject({ status: "scored", overall: 60 });
  });

  it("opens one scored Attempt by its Job and id; an unknown, unscored, other Job's, or another Tenant's is not found", async () => {
    const owner = await proTenantWithJob();
    const started = await start(owner.jobId);
    if (!started.ok) throw new Error("expected a started Attempt");
    const unscored = await scoredAttempt(owner.jobId, started.attempt.id);
    expect(unscored).toBeNull();

    const scored = await finishAndScore(started.attempt.id, started.attempt.questions);
    const opened = await scoredAttempt(owner.jobId, started.attempt.id);
    expect(opened).toEqual(scored);

    const otherJob = await createJob(
      { company: "Harvest", role: "Researcher", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "" },
      MONDAY,
    );
    expect(await scoredAttempt(otherJob.id, started.attempt.id)).toBeNull();
    expect(await scoredAttempt(owner.jobId, "c0000000000000000000000000")).toBeNull();

    const intruder = newUserId();
    await setPlan(intruder, "pro");
    signInAs(intruder);
    expect(await scoredAttempt(owner.jobId, started.attempt.id)).toBeNull();
    expect(await pastAttempts()).toEqual([]);
  });
});

describe("interview second pass ticket 08: asking how the Simulator is going", () => {
  it("scoring reports the Tenant's second scored Attempt across all Jobs — once: not the first, not the third, not a re-score", async () => {
    const { userId, jobId } = await proTenantWithJob();
    const otherJob = await createJob(
      { company: "Harvest", role: "Researcher", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "A posting." },
      MONDAY,
    );
    const resume = await withTenant(userId, (tx) => tx.document.findFirst({ select: { id: true } }));
    await setJobDocument(otherJob.id, "resume", resume!.id);

    /** Starts, finishes, and scores an Attempt on a Job, returning whether scoring asked. */
    async function rehearse(job: string, reset = false) {
      reply = { body: QUESTIONS() };
      const started = await start(job, 15, reset);
      if (!started.ok) throw new Error("expected a started Attempt");
      await answerAll(started.attempt.id, started.attempt.questions, 20);
      reply = { body: SCORES([70, 70, 70, 70, 70]) };
      const scored = await scoreAttempt(started.attempt.id, { client: claude() });
      if (!scored.ok) throw new Error("expected a scored Attempt");
      return { attemptId: started.attempt.id, askForFeedback: scored.askForFeedback };
    }

    expect((await rehearse(jobId)).askForFeedback).toBe(false);
    const second = await rehearse(otherJob.id);
    expect(second.askForFeedback).toBe(true);

    // Scoring the second again does not ask again.
    reply = { body: SCORES([80, 80, 80, 80, 80]) };
    expect(await scoreAttempt(second.attemptId, { client: claude() })).toMatchObject({ ok: true, askForFeedback: false });

    expect((await rehearse(jobId)).askForFeedback).toBe(false);
  });

  it("an Attempt started but never scored does not count towards the second", async () => {
    const { jobId } = await proTenantWithJob();
    const abandoned = await start(jobId);
    if (!abandoned.ok) throw new Error("expected a started Attempt");
    await endAttempt(abandoned.attempt.id);

    reply = { body: QUESTIONS() };
    const first = await start(jobId, 15, true);
    if (!first.ok) throw new Error("expected a started Attempt");
    await answerAll(first.attempt.id, first.attempt.questions, 20);
    reply = { body: SCORES([70, 70, 70, 70, 70]) };

    expect(await scoreAttempt(first.attempt.id, { client: claude() })).toMatchObject({ ok: true, askForFeedback: false });
  });
});

describe("tenant isolation", () => {
  it("one Tenant cannot see, answer, or score another's Attempt", async () => {
    const owner = await proTenantWithJob();
    const started = await start(owner.jobId);
    if (!started.ok) throw new Error("expected a started Attempt");

    const intruder = newUserId();
    await setPlan(intruder, "pro");
    signInAs(intruder);

    expect(await answerQuestion(started.attempt.id, {
      questionId: started.attempt.questions[0].id,
      transcript: "Not mine.",
      elapsedSeconds: 10,
    })).toMatchObject({ ok: false, reason: "no-attempt" });
    expect(await scoreAttempt(started.attempt.id, { client: claude() })).toMatchObject({
      ok: false,
      reason: "no-attempt",
    });
    // The other Tenant's Job is not on this Tenant's trail at all — nor are the questions it was asked.
    await expect(latestAttempt(owner.jobId)).rejects.toThrow(/isn't on your trail/);
    await expect(earlierQuestions(owner.jobId)).rejects.toThrow(/isn't on your trail/);

    // Nothing the intruder did reached the owner's Attempt.
    signInAs(owner.userId);
    const untouched = await latestAttempt(owner.jobId);
    expect(untouched?.questions[0].answer).toBeUndefined();
    expect(untouched?.overallScore).toBeNull();
  });
});
