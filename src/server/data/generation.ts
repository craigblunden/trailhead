import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { todayUtc } from "@/lib/dates";
import {
  GENERATION_FAILURES,
  HOLD_FLAGS,
  NO_COUNTS,
  isHeld,
  quotaStatus,
  weekStartOf,
  type QuotaCounts,
  type QuotaStatus,
} from "@/lib/generation";
import { coverLetterLabel } from "@/lib/jobs-rules";
import { limitsOf } from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import { toDateColumn } from "@/server/db/mappers";
import { withTenant, type Tenant, type TenantClient } from "@/server/db/tenant";
import type { CoverLetterInputs } from "@/server/generation/prompt";

import { RuleError } from "./errors";
import { ownJob } from "./jobs";
import { planOf } from "./plans";

/**
 * The data access layer for cover-letter generation. Generation persists the quota counter, the
 * Job's Draft (ADR-0002), the Activity entry each write leaves, and this week's Flags — and nothing
 * else. Feedback is never stored.
 *
 * The quota decisions (ticket 18; feedback issue 04):
 * - **A Plan's letters per user per week** (`src/lib/plans.ts`), weeks starting Monday in UTC.
 * - **The counter is a `GenerationQuota` row per user per week**, tenant data under RLS. The same
 *   row counts Flags; a Tenant is on Hold while `flagged` has reached `HOLD_FLAGS`, and the Hold
 *   lapses with the week because it is never stored anywhere else.
 * - **A letter is reserved before the Claude call and given back if none is delivered** — for a
 *   failure of ours or Anthropic's. A refusal stays counted: it is the one failure the user's own
 *   material can cause, and refunding it made probing free.
 * - **The reservation is one upsert whose update only applies below the Limit and off Hold**, so
 *   concurrent requests cannot overdraw it.
 * - **Storing the Draft, the Activity entry, and a Flag is one transaction**, so a crash cannot
 *   deliver a flagged letter without remembering the Flag.
 *
 * The order these run in is the generation module's (`src/server/generation/generate-cover-letter.ts`).
 */

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** The Tenant's letters-per-week Limit, from inside the transaction that counts against it. */
const lettersPerWeek = async (tenant: Tenant) => limitsOf(await planOf(tenant)).lettersPerWeek;

/** This week's row as it stands, or zeros when there is none yet. */
async function weekCounts(tx: TenantClient, userId: string, weekStart: string): Promise<QuotaCounts> {
  const row = await tx.generationQuota.findFirst({
    where: { userId, weekStart: toDateColumn(weekStart) },
    select: { used: true, flagged: true },
  });
  return row ?? NO_COUNTS;
}

export async function generationQuota(now: Date = new Date()): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { counts, limit } = await withTenant(userId, async (tx, tenant) => ({
    counts: await weekCounts(tx, userId, weekStart),
    limit: await lettersPerWeek(tenant),
  }));
  return quotaStatus(counts, weekStart, limit);
}

/** What a letter is written from, and the Draft a Rewrite would start from (empty when none). */
export type CoverLetterSources = Pick<
  CoverLetterInputs,
  "company" | "role" | "description" | "resumeText" | "sampleLetter"
> & {
  draft: string;
};

/**
 * What the letter is written from: the Job's company, role, and description, its attached resume's
 * extracted text, the user's latest uploaded cover letter as a guide to their voice, and its Draft.
 * A missing and a foreign Job are the same `NotFoundError`; a Job with no usable resume, or no
 * description — or, for a Rewrite, no Draft — is refused with a message saying what to do, before any
 * quota is taken, because there is nothing to write the letter from. Having no cover letter on file
 * refuses nothing: the guide is an improvement on the letter, never a requirement for one.
 */
export async function coverLetterSources(
  jobId: string,
  { rewrite = false }: { rewrite?: boolean } = {},
): Promise<CoverLetterSources> {
  const { userId } = await requireSession();
  const { job, sample } = await withTenant(userId, async (tx, tenant) => ({
    job: await ownJob(tenant, jobId, {
      company: true,
      role: true,
      description: true,
      draft: true,
      resume: { select: { text: true, ingestion: true, deletedAt: true } },
    }),
    // The newest one they uploaded, whichever Jobs it is attached to — this is about their voice.
    sample: await tx.document.findFirst({
      where: { userId, kind: "cover_letter", ingestion: "ready", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { text: true },
    }),
  }));
  const resume = job.resume;
  if (!resume || resume.ingestion !== "ready" || resume.deletedAt || !resume.text.trim()) {
    throw new RuleError("no-resume", GENERATION_FAILURES["no-resume"]);
  }
  if (!job.description.trim()) {
    throw new RuleError("no-description", GENERATION_FAILURES["no-description"]);
  }
  if (rewrite && !job.draft) throw new RuleError("no-draft", GENERATION_FAILURES["no-draft"]);
  return {
    company: job.company,
    role: job.role,
    description: job.description,
    resumeText: resume.text,
    sampleLetter: sample?.text.trim() || undefined,
    draft: job.draft,
  };
}

/**
 * Takes one letter from this week's quota, or refuses: `held` while the Tenant is on Hold, `quota`
 * when none is left. The two are told apart after the upsert returns no row, by reading the row, so
 * the user hears "paused" rather than "used up" when that is the truth.
 */
export async function reserveCoverLetter(
  now: Date = new Date(),
): Promise<{ weekStart: string; quota: QuotaStatus }> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { rows, limit, counts } = await withTenant(userId, async (tx, tenant) => {
    const limit = await lettersPerWeek(tenant);
    // The update applies only below the Limit and off Hold; under an unlimited Limit, only off Hold.
    const belowLimit = limit === "unlimited" ? Prisma.sql`true` : Prisma.sql`"GenerationQuota"."used" < ${limit}`;
    const rows = await tx.$queryRaw<QuotaCounts[]>`
      insert into "GenerationQuota" ("userId", "weekStart", "used", "updatedAt")
      values (${userId}::uuid, ${weekStart}::date, 1, now())
      on conflict ("userId", "weekStart") do update
        set "used" = "GenerationQuota"."used" + 1, "updatedAt" = now()
        where ${belowLimit} and "GenerationQuota"."flagged" < ${HOLD_FLAGS}
      returning "used", "flagged"
    `;
    return { rows, limit, counts: rows.length === 0 ? await weekCounts(tx, userId, weekStart) : rows[0] };
  });
  if (rows.length === 0) {
    if (isHeld(counts.flagged)) throw new RuleError("held", GENERATION_FAILURES.held);
    throw new RuleError("quota", GENERATION_FAILURES.quota);
  }
  return { weekStart, quota: quotaStatus(rows[0], weekStart, limit) };
}

/** Gives back a letter reserved in `weekStart` when none was delivered. Never goes below zero. */
export async function refundCoverLetter(weekStart: string): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  if (!WEEK.test(weekStart)) throw new Error("refundCoverLetter: weekStart must be YYYY-MM-DD");
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => ({
    rows: await tx.$queryRaw<QuotaCounts[]>`
      update "GenerationQuota"
         set "used" = greatest("used" - 1, 0), "updatedAt" = now()
       where "userId" = ${userId}::uuid and "weekStart" = ${weekStart}::date
      returning "used", "flagged"
    `,
    limit: await lettersPerWeek(tenant),
  }));
  return quotaStatus(rows[0] ?? NO_COUNTS, weekStart, limit);
}

/**
 * Counts a Flag against this week without taking a letter: Feedback refused before any reservation
 * for carrying hidden characters. The week's row is made if it does not exist yet.
 */
export async function flagWithoutLetter(now: Date = new Date()): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => ({
    rows: await tx.$queryRaw<QuotaCounts[]>`
      insert into "GenerationQuota" ("userId", "weekStart", "used", "flagged", "updatedAt")
      values (${userId}::uuid, ${weekStart}::date, 0, 1, now())
      on conflict ("userId", "weekStart") do update
        set "flagged" = "GenerationQuota"."flagged" + 1, "updatedAt" = now()
      returning "used", "flagged"
    `,
    limit: await lettersPerWeek(tenant),
  }));
  return quotaStatus(rows[0], weekStart, limit);
}

/**
 * A delivered letter, stored: the Job's Draft replaced, the write's Activity entry written, and —
 * when the writer's verdict made this write a Flag — the week's count raised, all in one
 * transaction. Returns the quota as it then stands.
 */
export async function storeCoverLetter(
  jobId: string,
  letter: string,
  { rewrite, flag, weekStart, now = new Date() }: { rewrite: boolean; flag: boolean; weekStart: string; now?: Date },
): Promise<QuotaStatus> {
  const { userId } = await requireSession();
  if (!WEEK.test(weekStart)) throw new Error("storeCoverLetter: weekStart must be YYYY-MM-DD");
  const { counts, limit } = await withTenant(userId, async (tx, tenant) => {
    const job = await ownJob(tenant, jobId, { id: true });
    await tx.job.update({
      where: { id: job.id, userId },
      data: {
        draft: letter,
        draftWrittenAt: now,
        activity: { create: { userId, label: coverLetterLabel(rewrite), date: toDateColumn(todayUtc(now)) } },
      },
    });
    if (flag) {
      await tx.generationQuota.updateMany({
        where: { userId, weekStart: toDateColumn(weekStart) },
        data: { flagged: { increment: 1 }, updatedAt: now },
      });
    }
    return { counts: await weekCounts(tx, userId, weekStart), limit: await lettersPerWeek(tenant) };
  });
  return quotaStatus(counts, weekStart, limit);
}
