import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { GENERATION_FAILURES, quotaStatus, weekStartOf, type QuotaStatus } from "@/lib/generation";
import { limitsOf } from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import { toDateColumn } from "@/server/db/mappers";
import { withTenant, type Tenant } from "@/server/db/tenant";
import type { CoverLetterInputs } from "@/server/generation/prompt";

import { RuleError } from "./errors";
import { ownJob } from "./jobs";
import { planOf } from "./plans";

/**
 * The data access layer for cover-letter generation. Generation persists nothing but the quota
 * counter: the letter is text on the user's screen and nowhere else.
 *
 * The quota decisions (ticket 18):
 * - **A Plan's letters per user per week** (`src/lib/plans.ts`), weeks starting Monday in UTC.
 * - **The counter is a `GenerationQuota` row per user per week**, tenant data under RLS.
 * - **A letter is reserved before the Claude call and given back if none is delivered.** Only a
 *   delivered letter uses one up: a refusal, an API error, a timeout, and a truncated letter all
 *   refund. Retrying is then free for the user, and that is safe for the bill because nothing
 *   retries automatically and a refusal before any output is not billed.
 * - **The reservation is one upsert whose update only applies below the limit**, so concurrent
 *   requests cannot overdraw it.
 *
 * The order these run in is the generation module's (`src/server/generation/generate-cover-letter.ts`).
 */

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** The Tenant's letters-per-week Limit, from inside the transaction that counts against it. */
const lettersPerWeek = async (tenant: Tenant) => limitsOf(await planOf(tenant)).lettersPerWeek;

export async function generationQuota(now: Date = new Date()): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { used, limit } = await withTenant(userId, async (tx, tenant) => ({
    used: (await tx.generationQuota.findFirst({ where: { userId, weekStart: toDateColumn(weekStart) } }))?.used ?? 0,
    limit: await lettersPerWeek(tenant),
  }));
  return quotaStatus(used, weekStart, limit);
}

/**
 * What the letter is written from: the Job's company, role, and description, and its attached
 * resume's extracted text. A missing and a foreign Job are the same `NotFoundError`; a Job with no
 * usable resume, or no description, is refused with a message saying what to do — before any quota
 * is taken, because there is nothing to write the letter from.
 */
export async function coverLetterInputs(jobId: string): Promise<CoverLetterInputs> {
  const { userId } = await requireSession();
  const job = await withTenant(userId, (_tx, tenant) =>
    ownJob(tenant, jobId, {
      company: true,
      role: true,
      description: true,
      resume: { select: { text: true, ingestion: true, deletedAt: true } },
    }),
  );
  const resume = job.resume;
  if (!resume || resume.ingestion !== "ready" || resume.deletedAt || !resume.text.trim()) {
    throw new RuleError("no-resume", GENERATION_FAILURES["no-resume"]);
  }
  if (!job.description.trim()) {
    throw new RuleError("no-description", GENERATION_FAILURES["no-description"]);
  }
  return { company: job.company, role: job.role, description: job.description, resumeText: resume.text };
}

/** Takes one letter from this week's quota, or refuses with `quota` when none is left. */
export async function reserveCoverLetter(
  now: Date = new Date(),
): Promise<{ weekStart: string; quota: QuotaStatus }> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => {
    const limit = await lettersPerWeek(tenant);
    // The update applies only below the Limit; under an unlimited one, always.
    const belowLimit = limit === "unlimited" ? Prisma.sql`true` : Prisma.sql`"GenerationQuota"."used" < ${limit}`;
    const rows = await tx.$queryRaw<{ used: number }[]>`
      insert into "GenerationQuota" ("userId", "weekStart", "used", "updatedAt")
      values (${userId}::uuid, ${weekStart}::date, 1, now())
      on conflict ("userId", "weekStart") do update
        set "used" = "GenerationQuota"."used" + 1, "updatedAt" = now()
        where ${belowLimit}
      returning "used"
    `;
    return { rows, limit };
  });
  if (rows.length === 0) throw new RuleError("quota", GENERATION_FAILURES.quota);
  return { weekStart, quota: quotaStatus(rows[0].used, weekStart, limit) };
}

/** Gives back a letter reserved in `weekStart` when none was delivered. Never goes below zero. */
export async function refundCoverLetter(weekStart: string): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  if (!WEEK.test(weekStart)) throw new Error("refundCoverLetter: weekStart must be YYYY-MM-DD");
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => ({
    rows: await tx.$queryRaw<{ used: number }[]>`
      update "GenerationQuota"
         set "used" = greatest("used" - 1, 0), "updatedAt" = now()
       where "userId" = ${userId}::uuid and "weekStart" = ${weekStart}::date
      returning "used"
    `,
    limit: await lettersPerWeek(tenant),
  }));
  return quotaStatus(rows[0]?.used ?? 0, weekStart, limit);
}
