import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { UnauthenticatedError } from "@/server/auth/session";
import { createJob } from "@/server/data/jobs";
import {
  coverLetterInputs,
  generationQuota,
  refundCoverLetter,
  reserveCoverLetter,
} from "@/server/data/generation";
import { NotFoundError, RuleError } from "@/server/data/errors";
import { setJobDocument } from "@/server/data/documents";
import { prisma } from "@/server/db/prisma";
import { withTenant } from "@/server/db/tenant";
import { COVER_LETTER_MODEL } from "@/server/generation/cover-letter";
import { generateCoverLetter } from "@/server/generation/generate-cover-letter";

import { newUserId, resetTables } from "./helpers";

/**
 * Nothing is mocked but the session. The Claude call goes through a real SDK client — the seam the
 * generation module takes — to a local fake of the Messages API, so every other layer runs for real:
 * the quota upsert, the policies, the refunds. What the fake answers is set per test.
 */
type Reply = { status?: number; delayMs?: number; body: unknown; onRequest?: () => void };

let reply: Reply;
let requests = 0;
let server: Server;
let baseURL: string;

const message = (overrides: Record<string, unknown>) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: COVER_LETTER_MODEL,
  content: [],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 900, output_tokens: 400 },
  ...overrides,
});

const LETTER = message({ content: [{ type: "text", text: "Dear Hiring Team," }] });

beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      requests += 1;
      reply.onRequest?.();
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

/** A real SDK client, pointed at the fake. */
const claude = (timeout = 5_000) => new Anthropic({ apiKey: "test-key", baseURL, maxRetries: 0, timeout });

const MONDAY = new Date("2026-07-20T09:00:00Z");
const SUNDAY_NIGHT = new Date("2026-07-26T23:59:00Z");
const NEXT_MONDAY = new Date("2026-07-27T00:00:00Z");

async function jobWithResume(userId: string, description = "A long and specific posting.") {
  signInAs(userId);
  const job = await createJob(
    { company: "Fernwood", role: "Product Designer", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description },
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
  return job;
}

async function tableCounts(userId: string) {
  return withTenant(userId, async (tx) => ({
    jobs: await tx.job.count(),
    activity: await tx.activityEntry.count(),
    documents: await tx.document.count(),
    contacts: await tx.contact.count(),
  }));
}

beforeEach(async () => {
  await resetTables();
  signOut();
  reply = { body: LETTER };
  requests = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ticket 18: the quota", () => {
  it("allows five letters a week, reserved atomically even when requests race", async () => {
    signInAs(newUserId());
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => reserveCoverLetter(MONDAY)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    for (const refused of results.filter((r) => r.status === "rejected")) {
      expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(RuleError);
      expect((refused as PromiseRejectedResult).reason).toMatchObject({ code: "quota" });
    }
    expect(await generationQuota(SUNDAY_NIGHT)).toEqual({ limit: 5, used: 5, remaining: 0, resetsOn: "2026-07-27" });
  });

  it("opens a fresh week on Monday, UTC", async () => {
    signInAs(newUserId());
    for (let i = 0; i < 5; i += 1) await reserveCoverLetter(MONDAY);

    await expect(reserveCoverLetter(SUNDAY_NIGHT)).rejects.toMatchObject({ code: "quota" });
    expect((await reserveCoverLetter(NEXT_MONDAY)).quota).toMatchObject({ used: 1, remaining: 4 });
  });

  it("is counted per tenant, stored under RLS, and gives letters back without going below zero", async () => {
    const userA = newUserId();
    signInAs(userA);
    const { weekStart } = await reserveCoverLetter(MONDAY);
    await reserveCoverLetter(MONDAY);

    const userB = newUserId();
    signInAs(userB);
    expect(await generationQuota(MONDAY)).toMatchObject({ used: 0, remaining: 5 });
    expect(await withTenant(userB, (tx) => tx.generationQuota.count())).toBe(0);
    expect(await prisma.generationQuota.count()).toBe(0); // outside any tenant: nothing

    signInAs(userA);
    expect(await refundCoverLetter(weekStart)).toMatchObject({ used: 1 });
    expect(await refundCoverLetter(weekStart)).toMatchObject({ used: 0 });
    expect(await refundCoverLetter(weekStart)).toMatchObject({ used: 0 });
  });
});

describe("writing a cover letter (tickets 18, 19; architecture ticket 04)", () => {
  // The quota week is read from the clock; pin it, so a run at midnight on a Sunday cannot split one
  // test across two weeks.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MONDAY);
  });

  it("GEN-1: writes a letter, persists nothing but the quota counter, and reports what is left", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);
    const before = await tableCounts(user);

    expect(await generateCoverLetter(job.id, { client: claude() })).toEqual({
      ok: true,
      letter: "Dear Hiring Team,",
      quota: { limit: 5, used: 1, remaining: 4, resetsOn: "2026-07-27" },
    });
    expect(requests).toBe(1);
    expect(await tableCounts(user)).toEqual(before);
    expect(await withTenant(user, (tx) => tx.generationQuota.findMany({ select: { used: true } }))).toEqual([
      { used: 1 },
    ]);
  });

  it("GEN-2: allows five letters a week even when requests race, and a sixth never reaches Claude", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);

    const outcomes = await Promise.all(
      Array.from({ length: 7 }, () => generateCoverLetter(job.id, { client: claude() })),
    );

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(5);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
      expect.objectContaining({ ok: false, reason: "quota", refunded: false }),
      expect.objectContaining({ ok: false, reason: "quota", refunded: false }),
    ]);
    expect(requests).toBe(5);
    expect(await generationQuota()).toMatchObject({ used: 5, remaining: 0 });
  });

  it("GEN-3: a used-up week opens again on Monday, UTC", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);
    for (let i = 0; i < 5; i += 1) expect((await generateCoverLetter(job.id, { client: claude() })).ok).toBe(true);

    vi.setSystemTime(SUNDAY_NIGHT);
    expect(await generateCoverLetter(job.id, { client: claude() })).toMatchObject({
      ok: false,
      reason: "quota",
      quota: { remaining: 0 },
    });

    vi.setSystemTime(NEXT_MONDAY);
    expect(await generateCoverLetter(job.id, { client: claude() })).toMatchObject({
      ok: true,
      quota: { used: 1, remaining: 4 },
    });
    expect(requests).toBe(6);
  });

  it("GEN-4: a refusal, an API error, a timeout, and a truncated letter all give the letter back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    const job = await jobWithResume(user);
    const answers: { reason: string; answer: Reply; timeout?: number }[] = [
      {
        reason: "refused",
        answer: {
          body: message({
            stop_reason: "refusal",
            stop_details: { type: "refusal", category: null, explanation: "Declined." },
            content: [{ type: "text", text: "Dear" }],
          }),
        },
      },
      { reason: "failed", answer: { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } } },
      { reason: "timed-out", answer: { delayMs: 1_000, body: LETTER }, timeout: 200 },
      {
        reason: "truncated",
        answer: { body: message({ stop_reason: "max_tokens", content: [{ type: "text", text: "Dear Hiring Team, I" }] }) },
      },
    ];

    for (const { reason, answer, timeout } of answers) {
      reply = answer;
      expect(await generateCoverLetter(job.id, { client: claude(timeout) }), reason).toEqual({
        ok: false,
        reason,
        refunded: true,
        quota: { limit: 5, used: 0, remaining: 5, resetsOn: "2026-07-27" },
      });
    }
  });

  it("GEN-5: a crash after the letter was reserved gives it back, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    const job = await jobWithResume(user);
    // A 200 with no content at all: reading a letter out of it throws.
    reply = { body: { id: "msg_test", type: "message", role: "assistant", model: COVER_LETTER_MODEL, stop_reason: "end_turn" } };

    expect(await generateCoverLetter(job.id, { client: claude() })).toEqual({
      ok: false,
      reason: "failed",
      unexpected: true,
      refunded: true,
      quota: expect.objectContaining({ used: 0 }),
    });
  });

  it("GEN-6: if giving the letter back fails, the outcome says so — and the letter stays counted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    const job = await jobWithResume(user);
    // The session ends while Claude is answering, so the letter cannot be given back as this user.
    reply = { body: message({ stop_reason: "refusal" }), onRequest: signOut };

    expect(await generateCoverLetter(job.id, { client: claude() })).toEqual({
      ok: false,
      reason: "refused",
      refunded: false,
      quota: undefined,
    });

    signInAs(user);
    expect(await generationQuota()).toMatchObject({ used: 1 });
  });

  it("GEN-7: a Job with no resume, or no description, is refused before any quota is taken, and never reaches Claude", async () => {
    const user = newUserId();
    signInAs(user);
    const bare = await createJob(
      { company: "Cobalt", role: "Staff UX", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "A real posting." },
      MONDAY,
    );
    const undescribed = await jobWithResume(user, "");

    expect(await generateCoverLetter(bare.id, { client: claude() })).toEqual({
      ok: false,
      reason: "no-resume",
      refunded: false,
      quota: expect.objectContaining({ used: 0 }),
    });
    expect(await generateCoverLetter(undescribed.id, { client: claude() })).toEqual({
      ok: false,
      reason: "no-description",
      refunded: false,
      quota: expect.objectContaining({ used: 0 }),
    });
    expect(requests).toBe(0);
  });

  it("GEN-8: another Tenant's Job is the same not-found as a missing one, and takes no quota trying", async () => {
    const jobA = await jobWithResume(newUserId());
    signInAs(newUserId());

    await expect(generateCoverLetter(jobA.id, { client: claude() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(generateCoverLetter("does-not-exist", { client: claude() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(coverLetterInputs(jobA.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await generationQuota()).toMatchObject({ used: 0 });
    expect(requests).toBe(0);
  });

  it("GEN-9: with no Claude client it is unavailable, before the Job is read", async () => {
    signInAs(newUserId());

    // There is no such job: a module that read the job first would throw not-found.
    expect(await generateCoverLetter("no-such-job", { client: null })).toEqual({
      ok: false,
      reason: "unavailable",
      refunded: false,
    });
    expect(await generationQuota()).toMatchObject({ used: 0 });
  });

  it("GEN-10: without a session it throws, and nothing is attempted", async () => {
    await expect(generateCoverLetter("any-job", { client: claude() })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(requests).toBe(0);
  });
});
