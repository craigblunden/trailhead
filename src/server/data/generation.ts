import "server-only";

import {
  COVER_LETTER_QUOTA,
  GENERATION_FAILURES,
  quotaStatus,
  weekStartOf,
  type QuotaStatus,
} from "@/lib/generation";
import { requireSession } from "@/server/auth/session";
import { toDateColumn } from "@/server/db/mappers";
import { withTenant } from "@/server/db/tenant";
import type { CoverLetterInputs } from "@/server/generation/prompt";

import { NotFoundError, RuleError } from "./errors";

/**
 * The data access layer for cover-letter generation. Generation persists nothing but the quota
 * counter: the letter is text on the user's screen and nowhere else.
 *
 * The quota decisions (ticket 18):
 * - **Five letters per user per week**, weeks starting Monday in UTC (`COVER_LETTER_QUOTA`).
 * - **The counter is a `GenerationQuota` row per user per week**, tenant data under RLS.
 * - **A letter is reserved before the Claude call and given back if none is delivered.** Only a
 *   delivered letter uses one up: a refusal, an API error, a timeout, and a truncated letter all
 *   refund. Retrying is then free for the user, and that is safe for the bill because nothing
 *   retries automatically and a refusal before any output is not billed.
 * - **The reservation is one upsert whose update only applies below the limit**, so concurrent
 *   requests cannot overdraw it, and it is enforced here, in the route's own server-side path.
 */

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

export async function generationQuota(now: Date = new Date()): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const row = await withTenant(userId, (tx) =>
    tx.generationQuota.findFirst({ where: { userId, weekStart: toDateColumn(weekStart) } }),
  );
  return quotaStatus(row?.used ?? 0, weekStart);
}

/**
 * What the letter is written from: the Job's company, role, and description, and its attached
 * resume's extracted text. A missing and a foreign Job are the same `NotFoundError`; a Job with no
 * usable resume is refused with a message saying what to do.
 */
export async function coverLetterInputs(jobId: string): Promise<CoverLetterInputs> {
  const { userId } = await requireSession();
  const job = await withTenant(userId, (tx) =>
    tx.job.findFirst({
      where: { id: jobId, userId },
      select: {
        company: true,
        role: true,
        description: true,
        resume: { select: { text: true, ingestion: true, deletedAt: true } },
      },
    }),
  );
  if (!job) throw new NotFoundError();
  const resume = job.resume;
  if (!resume || resume.ingestion !== "ready" || resume.deletedAt || !resume.text.trim()) {
    throw new RuleError("no-resume", GENERATION_FAILURES["no-resume"]);
  }
  return { company: job.company, role: job.role, description: job.description, resumeText: resume.text };
}

/** Takes one letter from this week's quota, or refuses with `quota` when none is left. */
export async function reserveCoverLetter(
  now: Date = new Date(),
): Promise<{ weekStart: string; quota: QuotaStatus }> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const rows = await withTenant(userId, (tx) =>
    tx.$queryRaw<{ used: number }[]>`
      insert into "GenerationQuota" ("userId", "weekStart", "used", "updatedAt")
      values (${userId}::uuid, ${weekStart}::date, 1, now())
      on conflict ("userId", "weekStart") do update
        set "used" = "GenerationQuota"."used" + 1, "updatedAt" = now()
        where "GenerationQuota"."used" < ${COVER_LETTER_QUOTA}
      returning "used"
    `,
  );
  if (rows.length === 0) throw new RuleError("quota", GENERATION_FAILURES.quota);
  return { weekStart, quota: quotaStatus(rows[0].used, weekStart) };
}

/** Gives back a letter reserved in `weekStart` when none was delivered. Never goes below zero. */
export async function refundCoverLetter(weekStart: string): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  if (!WEEK.test(weekStart)) throw new Error("refundCoverLetter: weekStart must be YYYY-MM-DD");
  const rows = await withTenant(userId, (tx) =>
    tx.$queryRaw<{ used: number }[]>`
      update "GenerationQuota"
         set "used" = greatest("used" - 1, 0), "updatedAt" = now()
       where "userId" = ${userId}::uuid and "weekStart" = ${weekStart}::date
      returning "used"
    `,
  );
  return quotaStatus(rows[0]?.used ?? 0, weekStart);
}
