// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as answerRoute } from "@/app/api/practice-rounds/[id]/answer/route";
import { POST as startRoute } from "@/app/api/practice-rounds/route";
import { PRACTICE_FAILURES, type PracticeRound } from "@/lib/practice";
import { ACTION_MESSAGES } from "@/server/action-result";
import { UnauthenticatedError } from "@/server/auth/session";

/**
 * The two Practice round Route Handlers on their own (practice round ticket 03): what each outcome of
 * the orchestration layer means in HTTP, and how each body is read. The rules themselves are tested
 * against the real database in `tests/integration/practice-round.test.ts`.
 */
const orchestration = vi.hoisted(() => ({
  startPracticeRound: vi.fn(),
  answerPracticeQuestion: vi.fn(),
  endPracticeRound: vi.fn(),
}));

vi.mock("@/server/interview/practice-round", () => orchestration);

const session = vi.hoisted(() => ({ signedIn: true }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () =>
      session.signedIn ? { userId: "6a0c2e20-0000-4000-8000-000000000001", email: "t@example.com", name: "T" } : null,
  };
});

const round: PracticeRound = {
  id: "round-1",
  countdownSeconds: 480,
  activeSeconds: 0,
  startedAt: "2026-09-17T10:00:00.000Z",
  completedAt: null,
  questions: [{ id: "q1", category: "personal", order: 0, text: "What drains you at work?" }],
};

type Body = Record<string, unknown>;

async function call(
  request: Request,
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  id = "",
) {
  const response = await handler(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: (await response.json()) as Body };
}

const request = (body?: unknown, raw?: string) =>
  new Request("http://app/api/practice-rounds", {
    method: "POST",
    ...(raw !== undefined
      ? { body: raw }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

const start = (body?: unknown, raw?: string) => call(request(body, raw), (req) => startRoute(req));
const answer = (id: string, body?: unknown, raw?: string) => call(request(body, raw), answerRoute, id);

beforeEach(() => {
  for (const mock of Object.values(orchestration)) mock.mockReset();
  session.signedIn = true;
});

describe("starting a Practice round (practice round ticket 03)", () => {
  it("PR-R1: a started round is a 200 with the round, and reset defaults to false", async () => {
    orchestration.startPracticeRound.mockResolvedValue({ ok: true, round });

    expect(await start({})).toEqual({ status: 200, body: { ok: true, round } });
    expect(orchestration.startPracticeRound).toHaveBeenCalledWith({ reset: false });

    await start({ reset: true });
    expect(orchestration.startPracticeRound).toHaveBeenLastCalledWith({ reset: true });
  });

  it("PR-R2: a Plan with the full Simulator is a 403, and a round in progress a 409 that carries it", async () => {
    orchestration.startPracticeRound.mockResolvedValueOnce({ ok: false, reason: "has-simulator" });
    expect(await start({})).toEqual({
      status: 403,
      body: { ok: false, error: "has-simulator", message: PRACTICE_FAILURES["has-simulator"] },
    });

    orchestration.startPracticeRound.mockResolvedValueOnce({ ok: false, reason: "in-progress", round });
    expect(await start({})).toEqual({
      status: 409,
      body: { ok: false, error: "in-progress", message: PRACTICE_FAILURES["in-progress"], round },
    });
  });

  it("PR-R3: an unreadable body, or one with fields it does not know, is a 400 before any work", async () => {
    expect((await start(undefined, "{nope")).status).toBe(400);
    expect((await start({ reset: "yes" })).status).toBe(400);
    expect((await start({ reset: false, length: 15 })).status).toBe(400);
    expect(orchestration.startPracticeRound).not.toHaveBeenCalled();
  });
});

describe("answering a Practice round (practice round ticket 03)", () => {
  it("PR-R4: a recorded Answer is a 200 with the round as it now stands, stripped and trimmed on the way in", async () => {
    orchestration.answerPracticeQuestion.mockResolvedValue({ ok: true, round });

    expect(await answer("round-1", { questionId: "q1", transcript: "  I like​ building.  ", elapsedSeconds: 42 })).toEqual({
      status: 200,
      body: { ok: true, round },
    });
    expect(orchestration.answerPracticeQuestion).toHaveBeenCalledWith("round-1", {
      questionId: "q1",
      transcript: "I like building.",
      elapsedSeconds: 42,
    });
  });

  it("PR-R5: no body is the countdown running out with nothing said; a time-up body keeps what was said", async () => {
    orchestration.endPracticeRound.mockResolvedValue({ ok: true, round });

    expect((await answer("round-1")).status).toBe(200);
    expect(orchestration.endPracticeRound).toHaveBeenCalledWith("round-1");

    await answer("round-1", { timeUp: true, questionId: "q1", transcript: " Half of it " });
    expect(orchestration.endPracticeRound).toHaveBeenLastCalledWith("round-1", { questionId: "q1", transcript: "Half of it" });
    expect(orchestration.answerPracticeQuestion).not.toHaveBeenCalled();
  });

  it("PR-R6: a second Answer, a finished round, a foreign one, and a malformed id are all the same 404", async () => {
    orchestration.answerPracticeQuestion.mockResolvedValue({ ok: false, reason: "no-round" });
    const expected = { status: 404, body: { ok: false, error: "no-round", message: PRACTICE_FAILURES["no-round"] } };

    expect(await answer("round-1", { questionId: "q1", transcript: "Again.", elapsedSeconds: 1 })).toEqual(expected);
    expect(await answer("x".repeat(65), { questionId: "q1", transcript: "Again.", elapsedSeconds: 1 })).toEqual(expected);
  });

  it("PR-R7: an unreadable body, a transcript over the cap, and a nonsense clock are each a 400 before any work", async () => {
    expect((await answer("round-1", undefined, "{nope")).status).toBe(400);
    expect((await answer("round-1", { questionId: "q1", transcript: "x".repeat(6_001), elapsedSeconds: 1 })).status).toBe(400);
    expect((await answer("round-1", { questionId: "q1", transcript: "Fine.", elapsedSeconds: -4 })).status).toBe(400);
    expect(orchestration.answerPracticeQuestion).not.toHaveBeenCalled();
  });
});

describe("both routes", () => {
  it("PR-R8: no session is a 401, and nothing is attempted", async () => {
    session.signedIn = false;
    const expected = { status: 401, body: { ok: false, error: "unauthenticated", message: ACTION_MESSAGES.unauthenticated } };

    expect(await start({})).toEqual(expected);
    expect(await answer("round-1", { questionId: "q1", transcript: "Hi.", elapsedSeconds: 1 })).toEqual(expected);
    for (const mock of Object.values(orchestration)) expect(mock).not.toHaveBeenCalled();
  });

  it("PR-R9: a session that ends during the call is a 401, and an error of the application's own a 500", async () => {
    orchestration.startPracticeRound.mockRejectedValueOnce(new UnauthenticatedError());
    expect((await start({})).status).toBe(401);

    orchestration.answerPracticeQuestion.mockResolvedValueOnce({ ok: false, reason: "failed", unexpected: true });
    expect(await answer("round-1", { questionId: "q1", transcript: "Hi.", elapsedSeconds: 1 })).toEqual({
      status: 500,
      body: { ok: false, error: "failed", message: PRACTICE_FAILURES.failed },
    });
  });
});
