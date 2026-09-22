// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FOOTING_DIMENSIONS, FOOTING_FAILURES, normalise } from "@/lib/footing";
import {
  STATE_BUDGET,
  buildState,
  dimensionsFor,
  footingAvailable,
  footingTimeoutMs,
  createFootingClient,
  scoreFooting,
  type FootingSources,
} from "@/server/footing/typesafe";

/**
 * The fake TypeSafe API the e2e suite runs against (`tests/fakes/typesafe-server.mjs`), driven
 * through the real SDK and the real call (footing ticket 01): its answers and its markers are proven
 * here, so an e2e journey that reads a band is reading what the fake was asked for — and so the
 * validation that turns a bad answer into a refusal is exercised against a real HTTP response.
 */

let fake: ChildProcess;
let baseURL: string;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  fake = spawn(process.execPath, [join(process.cwd(), "tests", "fakes", "typesafe-server.mjs")], {
    env: { ...process.env, FAKE_TYPESAFE_PORT: String(port) },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseURL}/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The fake TypeSafe API did not start");
}, 20_000);

afterAll(() => {
  fake.kill();
});

const client = () => new TypeSafeClient({ apiKey: "test-key", baseURL, retry: { maxRetries: 0 }, timeout: 5_000, logLevel: "off" });

const sources: FootingSources = {
  company: "Fernwood",
  role: "Product Designer",
  description: "A long and specific posting asking for research, prototyping and a design system.",
  resumeText: "Sam Rivera — Senior Product Designer. Led the Meridian reporting redesign.",
  coverLetterText: "Dear Hiring Team, I led the Meridian reporting redesign.",
};

/** Nothing here should log; the two tests that expect a logged failure silence it themselves. */
async function quietly<T>(work: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = original;
  }
}

describe("footing ticket 01: the client", () => {
  it("FAKE-4: no key means unavailable, not broken", () => {
    const key = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(footingAvailable()).toBe(false);
      expect(createFootingClient()).toBeNull();
    } finally {
      if (key !== undefined) process.env.TYPESAFE_API_KEY = key;
    }
  });

  it("FAKE-5: with no client at all there is no call, and the outcome says so", async () => {
    expect(await scoreFooting(sources, { client: null })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("FAKE-6: the timeout is bounded, whatever the environment says", () => {
    const original = process.env.FOOTING_TIMEOUT_MS;
    try {
      process.env.FOOTING_TIMEOUT_MS = "999999";
      expect(footingTimeoutMs()).toBe(25_000);
      process.env.FOOTING_TIMEOUT_MS = "5000";
      expect(footingTimeoutMs()).toBe(5_000);
      delete process.env.FOOTING_TIMEOUT_MS;
      expect(footingTimeoutMs()).toBe(25_000);
    } finally {
      if (original === undefined) delete process.env.FOOTING_TIMEOUT_MS;
      else process.env.FOOTING_TIMEOUT_MS = original;
    }
  });
});

describe("footing ticket 01: the state", () => {
  it("FAKE-7: is pure data, cut to a documented budget, with invisible characters stripped", () => {
    const state = buildState({
      ...sources,
      description: `a​b${"x".repeat(20_000)}`,
      resumeText: "y".repeat(20_000),
      coverLetterText: "z".repeat(20_000),
    });
    expect(state.posting.description.startsWith("ab")).toBe(true);
    expect(state.posting.description).toHaveLength(STATE_BUDGET.description);
    expect(state.resume).toHaveLength(STATE_BUDGET.resume);
    expect(state.coverLetter).toHaveLength(STATE_BUDGET.coverLetter);
  });

  it("FAKE-8: the Letter is asked about only when there is a letter to read", () => {
    expect(dimensionsFor(sources)).toEqual([...FOOTING_DIMENSIONS]);
    expect(dimensionsFor({ ...sources, coverLetterText: "  " })).toEqual(
      FOOTING_DIMENSIONS.filter((dimension) => dimension !== "letter"),
    );
  });
});

describe("footing ticket 01: one request, five questions", () => {
  it("FAKE-9: answers every dimension asked for, normalised and banded from its own level", async () => {
    const outcome = await scoreFooting(sources, { client: client() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dimensions.map((scored) => scored.dimension)).toEqual([...FOOTING_DIMENSIONS]);
    // The fake's levels: skills 3, experience 2, domain 1, proof_of_work 2, letter 3.
    expect(outcome.dimensions.map((scored) => scored.score)).toEqual(
      [3, 2, 1, 2, 3].map((level) => normalise(level)),
    );
    for (const scored of outcome.dimensions) expect(scored.confidence).toBeCloseTo(0.8, 5);
  });

  it("FAKE-10: with no letter attached it asks four questions and answers four", async () => {
    const outcome = await scoreFooting({ ...sources, coverLetterText: "" }, { client: client() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dimensions.map((scored) => scored.dimension)).not.toContain("letter");
    expect(outcome.dimensions).toHaveLength(4);
  });

  it("FAKE-11: the [[fstrong]] and [[funclear]] markers move the answer, so a re-score is visible", async () => {
    const strong = await scoreFooting(
      { ...sources, description: `${sources.description} [[fstrong]]` },
      { client: client() },
    );
    expect(strong.ok && strong.dimensions.every((scored) => scored.score === 100)).toBe(true);

    const unclear = await scoreFooting(
      { ...sources, description: `${sources.description} [[funclear]]` },
      { client: client() },
    );
    expect(unclear.ok && unclear.dimensions.every((scored) => scored.confidence < 0.4)).toBe(true);
  });

  it("FAKE-12: a score outside the rubric is a malformed answer, not a result", async () => {
    const outcome = await quietly(() =>
      scoreFooting({ ...sources, description: `${sources.description} [[fmalformed]]` }, { client: client() }),
    );
    // `failed`, not `truncated`: the answer arrived in full, it just isn't a position on our rubric.
    expect(outcome).toEqual({ ok: false, reason: "failed" });
  });

  it("FAKE-13: their rate limit is never described as the Tenant's own", async () => {
    // The provider's limit is shared across the whole deployment, so it is `busy` — and `busy`'s copy
    // says nothing about how much this Tenant has scored, which `rate-limited`'s deliberately does.
    expect(
      await scoreFooting({ ...sources, description: "[[fratelimit]]" }, { client: client() }),
    ).toEqual({ ok: false, reason: "busy" });
    expect(FOOTING_FAILURES.busy).not.toMatch(/you/i);
    expect(FOOTING_FAILURES["rate-limited"]).toMatch(/you/i);

    expect(
      await quietly(() => scoreFooting({ ...sources, description: "[[foverload]]" }, { client: client() })),
    ).toEqual({ ok: false, reason: "failed" });
  });

  it("FAKE-14: waiting longer than the timeout is a timeout, and stores nothing", async () => {
    const slow = new TypeSafeClient({ apiKey: "test-key", baseURL, retry: { maxRetries: 0 }, timeout: 500, logLevel: "off" });
    expect(await scoreFooting({ ...sources, description: "[[fhang]]" }, { client: slow })).toEqual({
      ok: false,
      reason: "timed-out",
    });
  }, 20_000);
});
