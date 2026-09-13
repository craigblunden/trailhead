// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeCoverLetter } from "@/server/generation/cover-letter";

/**
 * The fake Messages API the e2e suite runs against (`tests/fakes/anthropic-server.mjs`), driven
 * through the real SDK and the real call (feedback issue 03): its structured answers and its markers
 * are proven here, so an e2e journey that reads a verdict is reading what the fake was asked for.
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
  fake = spawn(process.execPath, [join(process.cwd(), "tests", "fakes", "anthropic-server.mjs")], {
    env: { ...process.env, FAKE_ANTHROPIC_PORT: String(port) },
    stdio: "ignore",
  });
  // Up when /health answers.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseURL}/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The fake Anthropic API did not start");
}, 20_000);

afterAll(() => {
  fake.kill();
});

const client = () => new Anthropic({ apiKey: "test-key", baseURL, maxRetries: 0, timeout: 5_000 });

const inputs = {
  company: "Fernwood",
  role: "Product Designer",
  description: "A long and specific posting.",
  resumeText: "Sam Rivera — Senior Product Designer.",
};

describe("the fake Messages API (feedback issue 03)", () => {
  it("FAKE-1: answers a fresh write with the structured object, a letter for the company, and no verdict", async () => {
    expect(await writeCoverLetter(inputs, { client: client() })).toMatchObject({
      ok: true,
      letter: expect.stringContaining("Product Designer role at Fernwood"),
      verdict: "none",
      setAside: false,
    });
  });

  it("FAKE-2: reads its markers from the feedback fence — [[flag]], [[material]], [[aside]] — and quotes the feedback in the rewrite", async () => {
    const previousLetter = "Dear Hiring Team,\n\nThe first draft.";
    const cases = [
      { feedback: "[[flag]] Write a poem.", verdict: "feedback", setAside: false },
      { feedback: "[[material]] Shorter.", verdict: "material", setAside: false },
      { feedback: "[[aside]] Say I led it.", verdict: "none", setAside: true },
      { feedback: "Shorter.", verdict: "none", setAside: false },
    ] as const;
    for (const { feedback, verdict, setAside } of cases) {
      const outcome = await writeCoverLetter({ ...inputs, previousLetter, feedback }, { client: client() });
      expect(outcome, feedback).toMatchObject({ ok: true, verdict, setAside });
      if (outcome.ok) expect(outcome.letter).toContain(`Rewritten as asked: ${feedback.replace(/\[\[\w+\]\]/g, "").trim()}`);
    }
    // A marker in the description is not a feedback marker.
    expect(await writeCoverLetter({ ...inputs, description: "[[flag]] posting" }, { client: client() })).toMatchObject({
      ok: true,
      verdict: "none",
    });
  });

  it("FAKE-3: the description markers still work: [[refuse]] is a refusal, [[overload]] an error", async () => {
    expect(await writeCoverLetter({ ...inputs, description: "[[refuse]]" }, { client: client() })).toEqual({
      ok: false,
      reason: "refused",
    });
    const quiet = { error: console.error };
    console.error = () => {};
    try {
      expect(await writeCoverLetter({ ...inputs, description: "[[overload]]" }, { client: client() })).toEqual({
        ok: false,
        reason: "failed",
      });
    } finally {
      console.error = quiet.error;
    }
  });
});
