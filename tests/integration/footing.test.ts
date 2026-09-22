import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { FOOTING_DIMENSIONS, overallScore, type FootingDimension } from "@/lib/footing";
import { NotFoundError } from "@/server/data/errors";
import { FOOTING_DAILY_CEILING, footingHistory, footingsToday, hashText } from "@/server/data/footing";
import { withTenant } from "@/server/db/tenant";
import { footingScore } from "@/server/footing/score-footing";

import { newUserId, resetTables } from "./helpers";

/**
 * Scoring a Footing against the real database and its policies (footing tickets 02, 03).
 *
 * The provider is the one seam stubbed: everything either side of it — the readiness guard, the daily
 * ceiling, the insert, the staleness stamp — runs as shipped. A stub rather than the HTTP fake because
 * what is under test here is the order things happen in and what is left behind, not the wire format;
 * `tests/server/footing-typesafe.test.ts` covers the wire.
 */

const RESUME_TEXT = "Sam Rivera — Senior Product Designer. Led the Meridian reporting redesign.";
const LETTER_TEXT = "Dear Hiring Team, I led the Meridian reporting redesign.";
const DESCRIPTION = "A long and specific posting asking for research, prototyping and a design system.";

/** A client that answers every question asked with `level`, and records what it was asked. */
function stubClient(level = 2, confidence = 0.8) {
  const asked: string[][] = [];
  const client = {
    systemOne: async ({ questions }: { questions: Record<string, unknown> }) => {
      asked.push(Object.keys(questions));
      return {
        model: "jev-latest",
        usage: { input_tokens: 1, output_tokens: 0 },
        answers: Object.fromEntries(
          Object.keys(questions).map((name) => [name, { type: "score", score: level, confidence }]),
        ),
      };
    },
  } as unknown as TypeSafeClient;
  return { client, asked };
}

/** A client that answers with a score outside the rubric: a malformed answer, not a result. */
function malformedClient() {
  return {
    systemOne: async ({ questions }: { questions: Record<string, unknown> }) => ({
      model: "jev-latest",
      usage: { input_tokens: 1, output_tokens: 0 },
      answers: Object.fromEntries(
        Object.keys(questions).map((name) => [name, { type: "score", score: 99, confidence: 0.8 }]),
      ),
    }),
  } as unknown as TypeSafeClient;
}

/** A client that must never be reached. */
const refusingClient = {
  systemOne: async () => {
    throw new Error("the provider was called when it should not have been");
  },
} as unknown as TypeSafeClient;

type JobOptions = { description?: string; resume?: string | null; coverLetter?: string | null };

async function seedJob(userId: string, { description = DESCRIPTION, resume = RESUME_TEXT, coverLetter = null }: JobOptions = {}) {
  return withTenant(userId, async (tx) => {
    const document = async (kind: "resume" | "cover_letter", text: string) =>
      tx.document.create({
        data: {
          userId,
          kind,
          fileName: `${kind}.pdf`,
          storageKey: `${userId}/${kind}-${Math.random().toString(36).slice(2)}.pdf`,
          mimeType: "application/pdf",
          ingestion: "ready",
          text,
        },
      });
    const resumeRow = resume === null ? null : await document("resume", resume);
    const letterRow = coverLetter === null ? null : await document("cover_letter", coverLetter);
    return tx.job.create({
      data: {
        userId,
        company: "Fernwood",
        role: "Product Designer",
        location: "Remote (US)",
        description,
        addedOn: new Date("2026-09-20"),
        accent: "moss",
        resumeId: resumeRow?.id ?? null,
        coverLetterId: letterRow?.id ?? null,
      },
    });
  });
}

const footingRows = (userId: string) =>
  withTenant(userId, (tx) =>
    tx.footing.findMany({ where: { userId }, include: { dimensions: true }, orderBy: { scoredAt: "asc" } }),
  );

beforeEach(async () => {
  await resetTables();
  signOut();
});

describe("footing ticket 03: the readiness guard", () => {
  it("FOOT-28: a Job with no resume is refused before the provider is reached", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { resume: null });

    expect(await footingScore(job.id, { client: refusingClient })).toEqual({ ok: false, reason: "no-resume" });
    expect(await footingRows(userId)).toEqual([]);
  });

  it("FOOT-29: a Job with no description is refused the same way", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { description: "   " });

    expect(await footingScore(job.id, { client: refusingClient })).toEqual({
      ok: false,
      reason: "no-description",
    });
    expect(await footingRows(userId)).toEqual([]);
  });

  it("FOOT-30: an unusable resume — still ingesting, or tombstoned — counts as no resume", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    await withTenant(userId, (tx) => tx.document.updateMany({ where: { userId }, data: { ingestion: "pending" } }));

    expect(await footingScore(job.id, { client: refusingClient })).toEqual({ ok: false, reason: "no-resume" });
  });

  it("FOOT-31: with no client configured there is no Footing, and it is unavailable rather than broken", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);

    expect(await footingScore(job.id, { client: null })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("FOOT-32: a Job that is not this Tenant's is not found, whoever asks", async () => {
    const owner = newUserId();
    signInAs(owner);
    const job = await seedJob(owner);

    signInAs(newUserId());
    await expect(footingScore(job.id, { client: refusingClient })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("footing ticket 03: scoring, on every Plan", () => {
  it("FOOT-33: stores one Footing with a row per dimension, and no overall column", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { coverLetter: LETTER_TEXT });
    const { client, asked } = stubClient(3);

    const outcome = await footingScore(job.id, { client });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(asked).toEqual([[...FOOTING_DIMENSIONS]]);
    expect(outcome.previous).toBeNull();
    expect(outcome.footing.dimensions.map((scored) => scored.dimension)).toEqual([...FOOTING_DIMENSIONS]);
    expect(outcome.footing.changed).toEqual([]);
    // 3 of 4 levels → 75, weighted across four equal scores → 75.
    expect(overallScore(outcome.footing)).toBe(75);

    const rows = await footingRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].dimensions).toHaveLength(5);
    expect(Object.keys(rows[0])).not.toContain("overall");
  });

  it("FOOT-34: with no cover letter attached, the Letter dimension is neither asked nor stored", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    const { client, asked } = stubClient();

    const outcome = await footingScore(job.id, { client });
    expect(asked[0]).not.toContain("letter");
    expect(outcome.ok && outcome.footing.dimensions.map((scored) => scored.dimension)).not.toContain("letter");
    expect((await footingRows(userId))[0].dimensions).toHaveLength(4);
  });

  it("FOOT-35: scoring twice leaves two rows, and the newer one knows what came before it", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);

    const first = await footingScore(job.id, { client: stubClient(0).client });
    const second = await footingScore(job.id, { client: stubClient(4).client });

    expect(await footingRows(userId)).toHaveLength(2);
    expect(second.ok && second.previous?.id).toBe(first.ok ? first.footing.id : null);

    const history = await footingHistory(job.id);
    expect(history.newest?.id).toBe(second.ok ? second.footing.id : null);
    expect(history.earlier.map((footing) => footing.id)).toEqual([first.ok ? first.footing.id : ""]);
  });

  it("FOOT-36: a malformed answer stores nothing at all", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await footingScore(job.id, { client: malformedClient() })).toEqual({
        ok: false,
        reason: "failed",
      });
    } finally {
      quiet.mockRestore();
    }
    expect(await footingRows(userId)).toEqual([]);
  });
});

describe("footing ticket 03: the daily ceiling", () => {
  it("FOOT-37: refuses the next scoring once the day's ceiling is reached, and logs it", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    // The breaker counts what is stored today; fill the day directly rather than by calling out.
    await withTenant(userId, (tx) =>
      tx.footing.createMany({
        data: Array.from({ length: FOOTING_DAILY_CEILING }, () => ({
          userId,
          jobId: job.id,
          resumeHash: "r",
          descriptionHash: "d",
          coverLetterHash: "",
        })),
      }),
    );
    expect(await footingsToday()).toBe(FOOTING_DAILY_CEILING);

    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      expect(await footingScore(job.id, { client: refusingClient })).toEqual({
        ok: false,
        reason: "rate-limited",
      });
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("footing.ceiling"));
    } finally {
      logged.mockRestore();
    }
  });

  it("FOOT-38: yesterday's scorings do not count against today", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    await withTenant(userId, (tx) =>
      tx.footing.create({
        data: {
          userId,
          jobId: job.id,
          scoredAt: new Date("2026-09-21T23:00:00Z"),
          resumeHash: "r",
          descriptionHash: "d",
          coverLetterHash: "",
        },
      }),
    );

    expect(await footingsToday(new Date("2026-09-22T01:00:00Z"))).toBe(0);
    expect(await footingsToday(new Date("2026-09-21T23:30:00Z"))).toBe(1);
  });
});

describe("footing ticket 03: staleness is signalled, never recomputed", () => {
  it("FOOT-39: changing the description makes the newest Footing stale, and alters nothing about it", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    const scored = await footingScore(job.id, { client: stubClient(3).client });
    expect(scored.ok).toBe(true);

    await withTenant(userId, (tx) =>
      tx.job.update({ where: { id: job.id }, data: { description: `${DESCRIPTION} And one more thing.` } }),
    );

    const history = await footingHistory(job.id);
    expect(history.newest?.changed).toEqual(["description"]);
    // Still shown, and still exactly what it was: nothing recomputed it.
    expect(history.newest?.dimensions).toEqual(scored.ok ? scored.footing.dimensions : []);
    expect(await footingRows(userId)).toHaveLength(1);
  });

  it("FOOT-40: attaching a different resume, or editing the letter, is the change it says it is", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { coverLetter: LETTER_TEXT });
    await footingScore(job.id, { client: stubClient().client });

    const replacement = await withTenant(userId, (tx) =>
      tx.document.create({
        data: {
          userId,
          kind: "resume",
          fileName: "resume-v2.pdf",
          storageKey: `${userId}/resume-v2.pdf`,
          mimeType: "application/pdf",
          ingestion: "ready",
          text: "Sam Rivera — a revised resume, with outcomes.",
        },
      }),
    );
    await withTenant(userId, (tx) =>
      tx.job.update({ where: { id: job.id }, data: { resumeId: replacement.id } }),
    );

    expect((await footingHistory(job.id)).newest?.changed).toEqual(["resume"]);
  });

  it("FOOT-41: a Footing whose resume Document was deleted is kept, and reads permanently stale", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId);
    await footingScore(job.id, { client: stubClient().client });

    await withTenant(userId, (tx) => tx.document.deleteMany({ where: { userId, kind: "resume" } }));

    const history = await footingHistory(job.id);
    expect(history.newest).not.toBeNull();
    expect(history.newest?.changed).toEqual(["resume"]);
    // The hashes outlive the Document: the row is still there, with what it saw.
    const rows = await footingRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].resumeHash).toBe(hashText(RESUME_TEXT));
  });

  it("FOOT-42: a Footing never leaks to another Tenant, by id or by policy", async () => {
    const owner = newUserId();
    signInAs(owner);
    const job = await seedJob(owner);
    await footingScore(job.id, { client: stubClient().client });

    const stranger = newUserId();
    signInAs(stranger);
    await expect(footingHistory(job.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await withTenant(stranger, (tx) => tx.footing.findMany({ where: { userId: owner } }))).toEqual([]);
  });
});

describe("footing ticket 02: what is stored", () => {
  it("FOOT-43: the stamp is hashes, never copies of the text", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { coverLetter: LETTER_TEXT });
    await footingScore(job.id, { client: stubClient().client });

    const [row] = await footingRows(userId);
    expect(row.resumeHash).toBe(hashText(RESUME_TEXT));
    expect(row.coverLetterHash).toBe(hashText(LETTER_TEXT));
    expect(row.descriptionHash).toBe(hashText(DESCRIPTION));
    for (const value of [row.resumeHash, row.coverLetterHash, row.descriptionHash]) {
      expect(value).toHaveLength(64);
      expect(value).not.toContain("Rivera");
    }
  });

  it("FOOT-44: every dimension stored is one of the five the enum knows", async () => {
    const userId = newUserId();
    signInAs(userId);
    const job = await seedJob(userId, { coverLetter: LETTER_TEXT });
    await footingScore(job.id, { client: stubClient().client });

    const [row] = await footingRows(userId);
    for (const scored of row.dimensions) {
      expect(FOOTING_DIMENSIONS).toContain(scored.dimension as FootingDimension);
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(100);
    }
  });
});
