// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/jobs/[id]/cover-letter/route";
import {
  FEEDBACK_MAX_CHARS,
  FEEDBACK_UNREADABLE,
  GENERATION_FAILURES,
  type GenerationFailure,
  type GenerationResponse,
} from "@/lib/generation";
import { ACTION_MESSAGES } from "@/server/action-result";
import { UnauthenticatedError } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";

/**
 * The cover-letter Route Handler on its own (architecture ticket 04; feedback issue 04): what each
 * outcome of the generation module means in HTTP, how the optional body is read, and the replies the
 * handler makes itself. The quota rules are the module's, and are tested against the real database
 * in `tests/integration/generation.test.ts`.
 */
const generation = vi.hoisted(() => ({ generateCoverLetter: vi.fn() }));

vi.mock("@/server/generation/generate-cover-letter", () => generation);

const session = vi.hoisted(() => ({ signedIn: true }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () =>
      session.signedIn ? { userId: "6a0c2e20-0000-4000-8000-000000000001", email: "t@example.com", name: "T" } : null,
  };
});

const quota = { limit: 5, used: 1, remaining: 4, resetsOn: "2026-07-27", flags: 0, held: false };

async function post(id: string, body?: BodyInit, headers?: Record<string, string>) {
  const response = await POST(new Request(`http://app/api/jobs/${id}/cover-letter`, { method: "POST", body, headers }), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as GenerationResponse };
}

const json = (value: unknown) => [JSON.stringify(value), { "content-type": "application/json" }] as const;

beforeEach(() => {
  generation.generateCoverLetter.mockReset();
  session.signedIn = true;
});

describe("what an outcome means in HTTP", () => {
  it("ROUTE-1: a written letter is a 200 with the letter, the verdict, and what is left", async () => {
    generation.generateCoverLetter.mockResolvedValue({ ok: true, letter: "Dear Hiring Team,", verdict: "none", setAside: false, quota });

    expect(await post("job-1")).toEqual({
      status: 200,
      body: { ok: true, letter: "Dear Hiring Team,", verdict: "none", setAside: false, quota },
    });
    expect(generation.generateCoverLetter).toHaveBeenCalledWith("job-1", { client: null, feedback: "" });
  });

  it.each<[GenerationFailure, number]>([
    ["refused", 422],
    ["failed", 502],
    ["timed-out", 504],
    ["truncated", 502],
    ["unavailable", 503],
    ["quota", 429],
    ["held", 429],
    ["no-resume", 409],
    ["no-description", 409],
    ["no-draft", 409],
    ["hidden-feedback", 422],
  ])("ROUTE-2: %s is a %i that says what happened and whether the letter was given back", async (reason, status) => {
    generation.generateCoverLetter.mockResolvedValue({ ok: false, reason, refunded: reason === "failed", quota });

    expect(await post("job-1")).toEqual({
      status,
      body: { ok: false, error: reason, message: GENERATION_FAILURES[reason], refunded: reason === "failed", quota },
    });
  });

  it("ROUTE-3: a failure of the application's own is a 500, whatever its failure code", async () => {
    generation.generateCoverLetter.mockResolvedValue({ ok: false, reason: "failed", unexpected: true, refunded: true, quota });

    expect(await post("job-1")).toMatchObject({ status: 500, body: { error: "failed", refunded: true } });
  });
});

describe("the optional body (feedback issue 04)", () => {
  it("ROUTE-8: feedback in a JSON body reaches the module trimmed and stripped; no body, an empty object, and blank feedback are a fresh write", async () => {
    generation.generateCoverLetter.mockResolvedValue({ ok: true, letter: "Dear", verdict: "none", setAside: false, quota });

    await post("job-1", ...json({ feedback: "  Shorter​, please.  " }));
    expect(generation.generateCoverLetter).toHaveBeenLastCalledWith("job-1", { client: null, feedback: "Shorter, please." });

    for (const body of [undefined, "", ...[json({}), json({ feedback: "  " }), json({ feedback: null })].map(([b]) => b)]) {
      await post("job-1", body, { "content-type": "application/json" });
      expect(generation.generateCoverLetter).toHaveBeenLastCalledWith("job-1", { client: null, feedback: "" });
    }
  });

  it("ROUTE-9: a body that is not JSON, feedback that is not text, or feedback over the cap is a 400 in the card's shape, before any session or quota work", async () => {
    const bad: [BodyInit, Record<string, string>][] = [
      ["not json", { "content-type": "application/json" }],
      [...json({ feedback: 42 })],
      [...json({ feedback: "x".repeat(FEEDBACK_MAX_CHARS + 1) })],
    ];
    for (const [body, headers] of bad) {
      expect(await post("job-1", body, headers)).toEqual({
        status: 400,
        body: { ok: false, error: "failed", message: FEEDBACK_UNREADABLE, refunded: false },
      });
    }
    expect(generation.generateCoverLetter).not.toHaveBeenCalled();

    // Exactly the cap is fine.
    generation.generateCoverLetter.mockResolvedValue({ ok: true, letter: "Dear", verdict: "none", setAside: false, quota });
    expect((await post("job-1", ...json({ feedback: "x".repeat(FEEDBACK_MAX_CHARS) }))).status).toBe(200);
  });
});

describe("the replies the handler makes itself", () => {
  it("ROUTE-4: no session is a 401, and nothing is attempted", async () => {
    session.signedIn = false;

    expect(await post("job-1")).toEqual({
      status: 401,
      body: { ok: false, error: "unauthenticated", message: ACTION_MESSAGES.unauthenticated },
    });
    expect(generation.generateCoverLetter).not.toHaveBeenCalled();
  });

  it("ROUTE-5: a malformed id and a missing or foreign Job are the same 404", async () => {
    generation.generateCoverLetter.mockRejectedValue(new NotFoundError());

    const malformed = await post("x".repeat(65));
    const missing = await post("job-1");

    expect(malformed).toEqual({
      status: 404,
      body: { ok: false, error: "not-found", message: "This job isn't on your trail." },
    });
    expect(missing).toEqual(malformed);
    expect(generation.generateCoverLetter).toHaveBeenCalledTimes(1);
  });

  it("ROUTE-6: a session that ends during the call is a 401", async () => {
    generation.generateCoverLetter.mockRejectedValue(new UnauthenticatedError());

    expect((await post("job-1")).status).toBe(401);
  });
});

describe("the handler always answers", () => {
  it("ROUTE-7: an error of the application's own before the module answers is a 500 in the card's shape, and is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    generation.generateCoverLetter.mockRejectedValue(new TypeError("Cannot read properties of undefined"));

    expect(await post("job-1")).toEqual({
      status: 500,
      body: { ok: false, error: "failed", message: GENERATION_FAILURES.failed, refunded: false },
    });
    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0][0])).toContain("generation.route");
    logged.mockRestore();
  });
});
