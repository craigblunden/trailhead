import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { weekStartOf } from "@/lib/dates";
import {
  INTERVIEW_FAILURES,
  attemptSeconds,
  interviewQuotaStatus,
  type Attempt,
  type AttemptLength,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import { limitsOf } from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import type { GeneratedQuestion } from "@/server/interview/claude";
import { toAttemptDto, toDateColumn } from "@/server/db/mappers";
import { withTenant, type Tenant, type TenantClient } from "@/server/db/tenant";

import { RuleError } from "./errors";
import { ownJob } from "./jobs";
import { planOf } from "./plans";

/**
 * The data access layer for the Interview Simulator. It persists the weekly counter, the Attempt,
 * its generated question set, and the Answers recorded against it — and nothing else. No audio is
 * ever stored, because none ever reaches the server: an Answer arrives as text the browser
 * transcribed (or the Tenant typed).
 *
 * The quota decisions mirror the cover letter's (`./generation.ts`), against a counter of its own:
 * - **A Plan's Attempts per user per week** (`src/lib/plans.ts`), weeks starting Monday in UTC.
 * - **An `InterviewQuota` row per user per week**, tenant data under RLS. No Flags and no Hold — the
 *   cover letter's Flag machinery is about Feedback abuse and means nothing here, which is why this
 *   is a separate table rather than a column on that one.
 * - **An Attempt is reserved before the Claude call and given back only if generation fails.**
 *   Abandoning a started Attempt does not give it back: a delivered question set is a used Attempt,
 *   the same rule a delivered letter follows.
 * - **The reservation is one upsert whose update only applies below the Limit**, so concurrent
 *   requests cannot overdraw it.
 * - **The Attempt and its questions are written in one transaction**, so no Attempt can exist with a
 *   half-written question set.
 *
 * The order these run in is the orchestration layer's (`src/server/interview/`).
 */

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** The Tenant's Attempts-per-week Limit, from inside the transaction that counts against it. */
const interviewsPerWeek = async (tenant: Tenant) => limitsOf(await planOf(tenant)).interviewsPerWeek;

/** This week's count as it stands, or zero when there is no row yet. */
async function weekUsed(tx: TenantClient, userId: string, weekStart: string): Promise<number> {
  const row = await tx.interviewQuota.findFirst({
    where: { userId, weekStart: toDateColumn(weekStart) },
    select: { used: true },
  });
  return row?.used ?? 0;
}

/** The Attempt rows an Attempt DTO is built from. */
const ATTEMPT_INCLUDE = { questions: true } as const;

export async function interviewQuota(now: Date = new Date()): Promise<InterviewQuotaStatus> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { used, limit } = await withTenant(userId, async (tx, tenant) => ({
    used: await weekUsed(tx, userId, weekStart),
    limit: await interviewsPerWeek(tenant),
  }));
  return interviewQuotaStatus(used, weekStart, limit);
}

/** What an Attempt's questions are generated from. */
export type InterviewSources = {
  company: string;
  role: string;
  description: string;
  resumeText: string;
};

/**
 * What the questions are drawn from: the Job's company, role, and description, and its attached
 * resume's extracted text. A missing and a foreign Job are the same `NotFoundError`; a Job with no
 * usable resume, or no description, is refused before any quota is taken, because there is nothing
 * to ground the questions in — the same two refusals, for the same reason, as a cover letter's.
 */
export async function interviewSources(jobId: string): Promise<InterviewSources> {
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
    throw new RuleError("no-resume", INTERVIEW_FAILURES["no-resume"]);
  }
  if (!job.description.trim()) {
    throw new RuleError("no-description", INTERVIEW_FAILURES["no-description"]);
  }
  return { company: job.company, role: job.role, description: job.description, resumeText: resume.text };
}

/**
 * Takes one Attempt from this week's quota, or refuses with `quota` when none is left. One upsert
 * whose update only applies below the Limit, so two requests racing cannot both win the last one.
 */
export async function reserveAttempt(now: Date = new Date()): Promise<{ weekStart: string; quota: InterviewQuotaStatus }> {
  const { userId } = await requireSession();
  const weekStart = weekStartOf(now);
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => {
    const limit = await interviewsPerWeek(tenant);
    const belowLimit = limit === "unlimited" ? Prisma.sql`true` : Prisma.sql`"InterviewQuota"."used" < ${limit}`;
    const rows = await tx.$queryRaw<{ used: number }[]>`
      insert into "InterviewQuota" ("userId", "weekStart", "used", "updatedAt")
      values (${userId}::uuid, ${weekStart}::date, 1, now())
      on conflict ("userId", "weekStart") do update
        set "used" = "InterviewQuota"."used" + 1, "updatedAt" = now()
        where ${belowLimit}
      returning "used"
    `;
    return { rows, limit };
  });
  if (rows.length === 0) throw new RuleError("quota", INTERVIEW_FAILURES.quota);
  return { weekStart, quota: interviewQuotaStatus(rows[0].used, weekStart, limit) };
}

/** Gives back an Attempt reserved in `weekStart` when no question set was delivered. Never below zero. */
export async function refundAttempt(weekStart: string): Promise<InterviewQuotaStatus> {
  const { userId } = await requireSession();
  if (!WEEK.test(weekStart)) throw new Error("refundAttempt: weekStart must be YYYY-MM-DD");
  const { rows, limit } = await withTenant(userId, async (tx, tenant) => ({
    rows: await tx.$queryRaw<{ used: number }[]>`
      update "InterviewQuota"
         set "used" = greatest("used" - 1, 0), "updatedAt" = now()
       where "userId" = ${userId}::uuid and "weekStart" = ${weekStart}::date
      returning "used"
    `,
    limit: await interviewsPerWeek(tenant),
  }));
  return interviewQuotaStatus(rows[0]?.used ?? 0, weekStart, limit);
}

/**
 * The Attempt and its whole question set, in one transaction: an Attempt never exists with half a
 * question set behind it. The order the questions arrive in is the order they are asked in.
 */
export async function storeAttempt(
  jobId: string,
  length: AttemptLength,
  questions: GeneratedQuestion[],
): Promise<Attempt> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx, tenant) => {
    const job = await ownJob(tenant, jobId, { id: true });
    return tx.attempt.create({
      data: {
        userId,
        jobId: job.id,
        length,
        questions: {
          create: questions.map((question, order) => ({
            userId,
            category: question.category,
            order,
            text: question.text,
          })),
        },
      },
      include: ATTEMPT_INCLUDE,
    });
  });
  return toAttemptDto(row);
}

/**
 * The Tenant's newest Attempt for one Job, or null when they have never started one. The start
 * screen reads this to decide between offering a fresh Attempt, resuming an unfinished one, and
 * showing a Scorecard.
 */
export async function latestAttempt(jobId: string): Promise<Attempt | null> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx, tenant) => {
    const job = await ownJob(tenant, jobId, { id: true });
    return tx.attempt.findFirst({
      where: { userId, jobId: job.id },
      include: ATTEMPT_INCLUDE,
      orderBy: { startedAt: "desc" },
    });
  });
  return row ? toAttemptDto(row) : null;
}

/** One Attempt of the Tenant's, by id. A missing and a foreign Attempt are the same `NotFoundError`. */
export async function getAttempt(attemptId: string): Promise<Attempt> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.attempt.findFirst({ where: { id: attemptId, userId }, include: ATTEMPT_INCLUDE }),
  );
  if (!row) throw new RuleError("no-attempt", INTERVIEW_FAILURES["no-attempt"]);
  return toAttemptDto(row);
}

/**
 * One Answer, recorded against its question, with the seconds it consumed added to the Attempt's
 * active time — the two in one transaction, so the countdown can never fall out of step with what
 * was answered. The Attempt completes here when this was the last unanswered question.
 *
 * Writing the same question twice is refused: an Answer is what the Tenant said within that
 * question's time, and a second submission would be a second run at it.
 */
export async function recordAnswer(
  attemptId: string,
  { questionId, transcript, elapsedSeconds, now = new Date() }: {
    questionId: string;
    transcript: string;
    elapsedSeconds: number;
    now?: Date;
  },
): Promise<Attempt> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { id: attemptId, userId },
      include: ATTEMPT_INCLUDE,
    });
    if (!attempt || attempt.completedAt) {
      throw new RuleError("no-attempt", INTERVIEW_FAILURES["no-attempt"]);
    }
    const question = attempt.questions.find((candidate) => candidate.id === questionId);
    if (!question || question.answeredAt) {
      throw new RuleError("no-attempt", INTERVIEW_FAILURES["no-attempt"]);
    }

    await tx.attemptQuestion.update({
      where: { id: question.id, userId },
      data: { transcript, answeredAt: now },
    });
    // Every question but this one already has its Answer: the Attempt is finished.
    const last = attempt.questions.every((candidate) => candidate.id === question.id || candidate.answeredAt);
    return tx.attempt.update({
      where: { id: attempt.id, userId },
      data: {
        activeSeconds: { increment: Math.max(Math.round(elapsedSeconds), 0) },
        ...(last ? { completedAt: now } : {}),
      },
      include: ATTEMPT_INCLUDE,
    });
  });
  return toAttemptDto(row);
}

/**
 * The countdown ran out mid-question: the Attempt ends where it stands. Whatever was being typed is
 * not recorded, and the remaining questions are simply left unanswered — nothing is force-submitted
 * or retried. The active time is set to the whole budget, so the Attempt reads as having no time
 * left rather than however much had been accounted when the last Answer landed.
 *
 * Completing an already-completed Attempt changes nothing and returns it as it stands, so a tab that
 * reports the expiry twice cannot move the finish line.
 */
export async function completeAttempt(attemptId: string, now: Date = new Date()): Promise<Attempt> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { id: attemptId, userId },
      include: ATTEMPT_INCLUDE,
    });
    if (!attempt) throw new RuleError("no-attempt", INTERVIEW_FAILURES["no-attempt"]);
    if (attempt.completedAt) return attempt;
    return tx.attempt.update({
      where: { id: attempt.id, userId },
      data: { completedAt: now, activeSeconds: attemptSeconds(toAttemptDto(attempt).length) },
      include: ATTEMPT_INCLUDE,
    });
  });
  return toAttemptDto(row);
}

/**
 * The Scorecard, stored: every Answer's score and rationale, and the Attempt's overall score, in one
 * transaction — so a Scorecard is never half-written. `scores` is in the order `scorable()` gave the
 * Answers to the scorer.
 */
export async function storeScores(
  attemptId: string,
  scores: { questionId: string; score: number; rationale: string }[],
  overall: number,
): Promise<Attempt> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const attempt = await tx.attempt.findFirst({ where: { id: attemptId, userId }, select: { id: true } });
    if (!attempt) throw new RuleError("no-attempt", INTERVIEW_FAILURES["no-attempt"]);
    for (const { questionId, score, rationale } of scores) {
      await tx.attemptQuestion.update({ where: { id: questionId, userId }, data: { score, rationale } });
    }
    return tx.attempt.update({
      where: { id: attempt.id, userId },
      data: { overallScore: overall },
      include: ATTEMPT_INCLUDE,
    });
  });
  return toAttemptDto(row);
}

