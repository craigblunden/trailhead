// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as answerRoute } from "@/app/api/attempts/[id]/answer/route";
import { POST as scoreRoute } from "@/app/api/attempts/[id]/score/route";
import { POST as startRoute } from "@/app/api/jobs/[id]/interview/route";
import {
  INTERVIEW_FAILURES,
  TRANSCRIPT_MAX_CHARS,
  type Attempt,
  type InterviewFailure,
} from "@/lib/interview";
import { ACTION_MESSAGES } from "@/server/action-result";
import { UnauthenticatedError } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";

/**
 * The three Interview Simulator Route Handlers on their own: what each outcome of the orchestration
 * layer means in HTTP, how each body is read, and the replies a handler makes itself. The quota and
 * timing rules are the orchestration layer's, and are tested against the real database in
 * `tests/integration/interview.test.ts`.
 */
const orchestration = vi.hoisted(() => ({
  startAttempt: vi.fn(),
  answerQuestion: vi.fn(),
  endAttempt: vi.fn(),
  scoreAttempt: vi.fn(),
}));

vi.mock("@/server/interview/start-attempt", () => ({ startAttempt: orchestration.startAttempt }));
vi.mock("@/server/interview/answer-attempt", () => ({
  answerQuestion: orchestration.answerQuestion,
  endAttempt: orchestration.endAttempt,
  scoreAttempt: orchestration.scoreAttempt,
}));

const session = vi.hoisted(() => ({ signedIn: true }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () =>
      session.signedIn ? { userId: "6a0c2e20-0000-4000-8000-000000000001", email: "t@example.com", name: "T" } : null,
  };
});

const quota = { limit: 10, used: 1, remaining: 9, resetsOn: "2026-09-21" };

const attempt: Attempt = {
  id: "attempt-1",
  jobId: "job-1",
  length: 10,
  activeSeconds: 0,
  completedAt: null,
  overallScore: null,
  questions: [{ id: "q1", category: "personal", order: 0, text: "Why this role?" }],
};

type Body = Record<string, unknown>;

const json = (value: unknown) => [JSON.stringify(value), { "content-type": "application/json" }] as const;

async function post(
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
  body?: BodyInit,
  headers?: Record<string, string>,
) {
  const response = await handler(new Request(`http://app/api/x/${id}`, { method: "POST", body, headers }), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

const start = (id: string, body: unknown = { length: 10 }) => post(startRoute, id, ...json(body));

beforeEach(() => {
  for (const mock of Object.values(orchestration)) mock.mockReset();
  session.signedIn = true;
});

describe("starting an Attempt: what an outcome means in HTTP (ticket 01)", () => {
  it("IV-R1: a started Attempt is a 200 with the Attempt and what is left, and the body's length and reset reach the module", async () => {
    orchestration.startAttempt.mockResolvedValue({ ok: true, attempt, quota });

    expect(await start("job-1", { length: 30, reset: true })).toEqual({
      status: 200,
      body: { ok: true, attempt, quota },
    });
    expect(orchestration.startAttempt).toHaveBeenCalledWith("job-1", { client: null, length: 30, reset: true });
  });

  it("IV-R2: reset defaults to false, so a start request never silently abandons an Attempt in progress", async () => {
    orchestration.startAttempt.mockResolvedValue({ ok: true, attempt, quota });

    await start("job-1", { length: 5 });

    expect(orchestration.startAttempt).toHaveBeenCalledWith("job-1", { client: null, length: 5, reset: false });
  });

  it.each<[InterviewFailure, number]>([
    ["refused", 422],
    ["failed", 502],
    ["timed-out", 504],
    ["truncated", 502],
    ["unavailable", 503],
    ["quota", 429],
    ["not-pro", 403],
    ["bad-length", 422],
    ["no-resume", 409],
    ["no-description", 409],
    ["in-progress", 409],
  ])("IV-R3: %s is a %i that says what happened and whether the Attempt was given back", async (reason, status) => {
    orchestration.startAttempt.mockResolvedValue({ ok: false, reason, refunded: reason === "failed", quota });

    expect(await start("job-1")).toEqual({
      status,
      body: {
        ok: false,
        error: reason,
        message: INTERVIEW_FAILURES[reason],
        refunded: reason === "failed",
        quota,
      },
    });
  });

  it("IV-R4: an Attempt already in progress comes back with that Attempt, so the page can offer to resume it", async () => {
    orchestration.startAttempt.mockResolvedValue({ ok: false, reason: "in-progress", refunded: false, attempt, quota });

    expect(await start("job-1")).toMatchObject({ status: 409, body: { error: "in-progress", attempt } });
  });

  it("IV-R5: a failure of the application's own is a 500, whatever its failure code", async () => {
    orchestration.startAttempt.mockResolvedValue({
      ok: false,
      reason: "failed",
      unexpected: true,
      refunded: true,
      quota,
    });

    expect(await start("job-1")).toMatchObject({ status: 500, body: { error: "failed", refunded: true } });
  });
});

describe("starting an Attempt: the body (tickets 04, 05)", () => {
  it("IV-R6: a length that is not one of the three, a missing one, and an unreadable body are each a 400 before any work", async () => {
    for (const body of [{ length: 15 }, { length: "10" }, {}, { length: 10, sneak: true }]) {
      expect(await start("job-1", body)).toEqual({
        status: 400,
        body: { ok: false, error: "bad-answer", message: INTERVIEW_FAILURES["bad-answer"], refunded: false },
      });
    }
    expect(await post(startRoute, "job-1", "not json", { "content-type": "application/json" })).toMatchObject({
      status: 400,
    });
    expect(orchestration.startAttempt).not.toHaveBeenCalled();
  });
});

describe("recording an Answer (ticket 02)", () => {
  const answer = { questionId: "q1", transcript: "I want the growth work.", elapsedSeconds: 42 };

  it("IV-R7: a recorded Answer is a 200 with the Attempt as it now stands, stripped and trimmed on the way in", async () => {
    orchestration.answerQuestion.mockResolvedValue({ ok: true, attempt });

    expect(await post(answerRoute, "attempt-1", ...json({ ...answer, transcript: "  I want​ the growth work.  " })))
      .toEqual({ status: 200, body: { ok: true, attempt } });
    expect(orchestration.answerQuestion).toHaveBeenCalledWith("attempt-1", answer);
  });

  it("IV-R8: no body at all is the countdown running out — the Attempt ends, and nothing is recorded", async () => {
    orchestration.endAttempt.mockResolvedValue({ ok: true, attempt: { ...attempt, completedAt: "2026-09-16T10:00:00.000Z" } });

    const outcome = await post(answerRoute, "attempt-1");

    expect(outcome.status).toBe(200);
    expect(orchestration.endAttempt).toHaveBeenCalledWith("attempt-1");
    expect(orchestration.answerQuestion).not.toHaveBeenCalled();
  });

  it("IV-R8b: a time-up body carries the answer part-written by then — stripped — and ends the Attempt rather than recording an Answer", async () => {
    orchestration.endAttempt.mockResolvedValue({ ok: true, attempt: { ...attempt, completedAt: "2026-09-16T10:00:00.000Z" } });

    const outcome = await post(
      answerRoute,
      "attempt-1",
      ...json({ timeUp: true, questionId: "q1", transcript: "  I led the​ redesign and  " }),
    );

    expect(outcome.status).toBe(200);
    expect(orchestration.endAttempt).toHaveBeenCalledWith("attempt-1", { questionId: "q1", transcript: "I led the redesign and" });
    expect(orchestration.answerQuestion).not.toHaveBeenCalled();
  });

  it("IV-R8c: a time-up body that is not one — no question, a transcript over the cap, extra fields, or timeUp not true — is a 400", async () => {
    for (const body of [
      { timeUp: true, transcript: "No question named." },
      { timeUp: true, questionId: "q1", transcript: "x".repeat(TRANSCRIPT_MAX_CHARS + 1) },
      { timeUp: true, questionId: "q1", transcript: "Sneaky.", elapsedSeconds: 0 },
      { timeUp: false, questionId: "q1", transcript: "Not time up." },
    ]) {
      expect(await post(answerRoute, "attempt-1", ...json(body))).toMatchObject({ status: 400, body: { error: "bad-answer" } });
    }
    expect(orchestration.endAttempt).not.toHaveBeenCalled();
    expect(orchestration.answerQuestion).not.toHaveBeenCalled();
  });

  it("IV-R9: a second Answer to the same question, and an Answer to a finished Attempt, are the same 404", async () => {
    orchestration.answerQuestion.mockResolvedValue({ ok: false, reason: "no-attempt" });

    expect(await post(answerRoute, "attempt-1", ...json(answer))).toEqual({
      status: 404,
      body: { ok: false, error: "no-attempt", message: INTERVIEW_FAILURES["no-attempt"] },
    });
  });

  it("IV-R10: an unreadable body, a transcript over the cap, and a nonsense clock are each a 400 before any work", async () => {
    const bad: [BodyInit, Record<string, string>][] = [
      ["not json", { "content-type": "application/json" }],
      [...json({ ...answer, transcript: "x".repeat(TRANSCRIPT_MAX_CHARS + 1) })],
      [...json({ ...answer, transcript: 42 })],
      [...json({ ...answer, elapsedSeconds: -1 })],
      // Longer than the longest Attempt: a tab cannot make the countdown jump.
      [...json({ ...answer, elapsedSeconds: 10_000 })],
      [...json({ transcript: "No question named." })],
    ];
    for (const [body, headers] of bad) {
      expect(await post(answerRoute, "attempt-1", body, headers)).toMatchObject({ status: 400, body: { error: "bad-answer" } });
    }
    expect(orchestration.answerQuestion).not.toHaveBeenCalled();

    // Exactly the cap is fine.
    orchestration.answerQuestion.mockResolvedValue({ ok: true, attempt });
    const atCap = await post(answerRoute, "attempt-1", ...json({ ...answer, transcript: "x".repeat(TRANSCRIPT_MAX_CHARS) }));
    expect(atCap.status).toBe(200);
  });
});

describe("scoring an Attempt (ticket 03)", () => {
  const scorecard = { overall: 71, categories: [{ category: "personal" as const, score: 71, questions: 1 }] };

  it("IV-R11: a scored Attempt is a 200 with the Attempt and its Scorecard, and the route sends no body of its own", async () => {
    orchestration.scoreAttempt.mockResolvedValue({ ok: true, attempt, scorecard });

    expect(await post(scoreRoute, "attempt-1")).toEqual({ status: 200, body: { ok: true, attempt, scorecard } });
    expect(orchestration.scoreAttempt).toHaveBeenCalledWith("attempt-1", { client: null });
  });

  it.each<[InterviewFailure, number]>([
    ["incomplete", 409],
    ["no-attempt", 404],
    ["refused", 422],
    ["failed", 502],
    ["timed-out", 504],
    ["unavailable", 503],
  ])("IV-R12: %s is a %i that says what happened", async (reason, status) => {
    orchestration.scoreAttempt.mockResolvedValue({ ok: false, reason });

    expect(await post(scoreRoute, "attempt-1")).toEqual({
      status,
      body: { ok: false, error: reason, message: INTERVIEW_FAILURES[reason] },
    });
  });

  it("IV-R13: no quota is ever reported by scoring — the Attempt was counted when it was started", async () => {
    orchestration.scoreAttempt.mockResolvedValue({ ok: false, reason: "failed" });

    expect((await post(scoreRoute, "attempt-1")).body).not.toHaveProperty("quota");
  });
});

describe("the replies each handler makes itself", () => {
  const routes = [
    ["start", startRoute, () => start("job-1")],
    ["answer", answerRoute, () => post(answerRoute, "attempt-1", ...json({ questionId: "q1", transcript: "x", elapsedSeconds: 1 }))],
    ["score", scoreRoute, () => post(scoreRoute, "attempt-1")],
  ] as const;

  it("IV-R14: no session is a 401 on every route, and nothing is attempted", async () => {
    session.signedIn = false;

    for (const [, , call] of routes) {
      expect(await call()).toEqual({
        status: 401,
        body: { ok: false, error: "unauthenticated", message: ACTION_MESSAGES.unauthenticated },
      });
    }
    for (const mock of Object.values(orchestration)) expect(mock).not.toHaveBeenCalled();
  });

  it("IV-R15: a malformed id and a missing or foreign row are the same 404 on every route", async () => {
    for (const mock of [orchestration.startAttempt, orchestration.answerQuestion, orchestration.scoreAttempt]) {
      mock.mockRejectedValue(new NotFoundError());
    }
    const expected = { status: 404, body: { ok: false, error: "not-found", message: "This job isn't on your trail." } };

    expect(await start("x".repeat(65))).toEqual(expected);
    expect(await start("job-1")).toEqual(expected);
    expect(await post(scoreRoute, "x".repeat(65))).toEqual(expected);
    expect(await post(scoreRoute, "attempt-1")).toEqual(expected);
  });

  it("IV-R16: a session that ends during the call is a 401", async () => {
    orchestration.scoreAttempt.mockRejectedValue(new UnauthenticatedError());

    expect((await post(scoreRoute, "attempt-1")).status).toBe(401);
  });

  it("IV-R17: an error of the application's own before the module answers is a 500 in the page's shape, and is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    orchestration.startAttempt.mockRejectedValue(new TypeError("Cannot read properties of undefined"));

    expect(await start("job-1")).toEqual({
      status: 500,
      body: { ok: false, error: "failed", message: INTERVIEW_FAILURES.failed, refunded: false },
    });
    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0][0])).toContain("interview.route.start");
    logged.mockRestore();
  });
});
