import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { POST } from "@/app/api/jobs/[id]/cover-letter/route";
import type { GenerationResponse } from "@/lib/generation";
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

import { newUserId, resetTables } from "./helpers";

/**
 * The Claude call is the one thing replaced: every other layer — the route, the data layer, the
 * quota upsert, the policies — runs for real. What comes back from Claude is set per test.
 */
const claude = vi.hoisted(() => ({
  outcome: { ok: true, letter: "Dear Hiring Team," } as { ok: true; letter: string } | { ok: false; reason: string },
  calls: 0,
  throws: false,
}));

vi.mock("@/server/generation/cover-letter", () => ({
  generationAvailable: () => true,
  createClaudeClient: () => ({}),
  writeCoverLetter: async () => {
    claude.calls += 1;
    if (claude.throws) throw new Error("something unexpected");
    return claude.outcome;
  },
}));

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

async function post(jobId: string) {
  const response = await POST(new Request(`http://app/api/jobs/${jobId}/cover-letter`, { method: "POST" }), {
    params: Promise.resolve({ id: jobId }),
  });
  return { status: response.status, body: (await response.json()) as GenerationResponse };
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
  claude.outcome = { ok: true, letter: "Dear Hiring Team," };
  claude.calls = 0;
  claude.throws = false;
  vi.useRealTimers();
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

describe("ticket 18: the route", () => {
  // The route reads the clock for the quota week; pin it, so a run at midnight on a Sunday cannot
  // split one test across two weeks.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MONDAY);
  });

  it("writes a letter, persists nothing but the quota counter, and reports what is left", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);
    const before = await tableCounts(user);

    const { status, body } = await post(job.id);

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, letter: "Dear Hiring Team,", quota: { used: 1, remaining: 4 } });
    expect(await tableCounts(user)).toEqual(before);
    expect(await withTenant(user, (tx) => tx.generationQuota.findMany({ select: { used: true } }))).toEqual([
      { used: 1 },
    ]);
  });

  it("enforces the quota server-side: calling the handler directly past the limit never reaches Claude", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);
    for (let i = 0; i < 5; i += 1) expect((await post(job.id)).status).toBe(200);
    expect(claude.calls).toBe(5);

    const sixth = await post(job.id);

    expect(sixth.status).toBe(429);
    expect(sixth.body).toMatchObject({ ok: false, error: "quota", quota: { remaining: 0 } });
    expect(claude.calls).toBe(5);
  });

  it("a failed generation does not burn quota — refusal, error, timeout, and truncation all give it back", async () => {
    const user = newUserId();
    const job = await jobWithResume(user);

    for (const [reason, status] of [
      ["refused", 422],
      ["failed", 502],
      ["timed-out", 504],
      ["truncated", 502],
    ] as const) {
      claude.outcome = { ok: false, reason };
      const result = await post(job.id);
      expect(result.status, reason).toBe(status);
      expect(result.body, reason).toMatchObject({
        ok: false,
        error: reason,
        refunded: true,
        quota: { used: 0, remaining: 5 },
      });
    }
  });

  it("a crash after the letter was reserved gives it back, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    const job = await jobWithResume(user);
    claude.throws = true;

    const result = await post(job.id);

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ ok: false, error: "failed", refunded: true, quota: { used: 0 } });
    expect(JSON.stringify(result.body)).not.toContain("something unexpected");
  });

  it("user B cannot generate against user A's job or document, and takes no quota trying", async () => {
    const userA = newUserId();
    const jobA = await jobWithResume(userA);

    signInAs(newUserId());
    const foreign = await post(jobA.id);
    const missing = await post("does-not-exist");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    await expect(coverLetterInputs(jobA.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await generationQuota()).toMatchObject({ used: 0 });
    expect(claude.calls).toBe(0);
  });

  it("refuses a job with no resume before taking quota, and asks for a session", async () => {
    const user = newUserId();
    signInAs(user);
    const bare = await createJob(
      { company: "Cobalt", role: "Staff UX", location: "Remote", salaryMin: null, salaryMax: null, postingUrl: "", description: "" },
      MONDAY,
    );

    const noResume = await post(bare.id);
    expect(noResume.status).toBe(409);
    expect(noResume.body).toMatchObject({ error: "no-resume", quota: { used: 0 } });

    signOut();
    expect((await post(bare.id)).status).toBe(401);
    expect(claude.calls).toBe(0);
  });
});
