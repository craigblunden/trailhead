import "server-only";

import { createHash } from "node:crypto";

import {
  FOOTING_FAILURES,
  FOOTING_HISTORY_MAX,
  changedSince,
  type Footing,
  type FootingDimensionScore,
  type FootingHistory,
  type FootingStamp,
} from "@/lib/footing";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/server/auth/session";
import { toFootingDto, toFootingStamp, type FootingRow } from "@/server/db/mappers";
import { withTenant } from "@/server/db/tenant";
import type { FootingSources } from "@/server/footing/typesafe";

import { RuleError } from "./errors";
import { ownJob } from "./jobs";

/**
 * The data access layer for a Footing (footing tickets 02, 03). It reads what a Footing is scored
 * from, counts what the Tenant has scored today, stores one, and reads a Job's history back.
 *
 * Three rules it exists to keep:
 *
 * - **Append-only.** `storeFooting` inserts; nothing here updates or deletes a Footing. The newest
 *   row for a Job is "the Footing", and the rest are its history (**ADR-0007**).
 * - **The overall is never stored.** Only the four dimensions' own 0–100 scores are, so tuning
 *   `WEIGHTS` re-reads history correctly.
 * - **Staleness is stamped, never recomputed.** What a Footing saw is kept as hashes and Document
 *   ids, and reading a Job compares them against the Job as it stands. A stale Footing is shown,
 *   never silently replaced (`CONTEXT.md`'s `Stale` rule).
 */

/**
 * The per-Tenant **daily ceiling** on scoring. A circuit breaker, not a Limit (**ADR-0007**): it is
 * never shown, never in the Plan comparison, never an upsell, and nothing in `PLAN_LIMITS` knows
 * about it. It exists so that a re-score loop introduced by a bug costs cents and stops, and so this
 * application stays well clear of the shared account-wide rate limit the provider applies.
 *
 * It lives here, server-side, rather than in `src/lib/footing.ts`, precisely so that no component can
 * reach it: a number no UI can import is a number no UI can accidentally start showing.
 *
 * Fifty is far above any real day — a Tenant runs 5–30 concurrent applications — and far below a
 * runaway. Concurrent requests can in principle both pass the check; that is acceptable for a
 * breaker whose job is to stop a loop, not to meter an entitlement.
 */
export const FOOTING_DAILY_CEILING = 50;

/** SHA-256 of one text, as the staleness stamp keeps it. Empty text hashes to the empty string. */
export function hashText(text: string): string {
  return text.length === 0 ? "" : createHash("sha256").update(text).digest("hex");
}

/**
 * The Job columns a stamp and the sources are both read from. The Documents' own ids come from the
 * relations rather than from `Job.resumeId`, because a Document that is attached but unusable — still
 * ingesting, or tombstoned — is not what a Footing read, and the stamp has to say so.
 */
const FOOTING_SELECT = {
  id: true,
  company: true,
  role: true,
  description: true,
  resume: { select: { id: true, text: true, ingestion: true, deletedAt: true } },
  coverLetter: { select: { id: true, text: true, ingestion: true, deletedAt: true } },
} as const;

/**
 * Exactly what `FOOTING_SELECT` returns, derived rather than hand-written: a column added to or
 * dropped from the select then fails the typecheck here, and `ingestion` keeps the generated enum
 * type that `enum-assertions.ts` exists to police.
 */
type FootingJob = Prisma.JobGetPayload<{ select: typeof FOOTING_SELECT }>;

/** A Document as a Footing reads it: an id and the text, or nothing. */
type ReadableDocument = { id: string; text: string };

/** A Document counts only when it is uploaded, extracted, not tombstoned, and says something. */
function usableText(attached: FootingJob["resume"]): ReadableDocument | null {
  if (!attached || attached.ingestion !== "ready" || attached.deletedAt || !attached.text.trim()) return null;
  return { id: attached.id, text: attached.text };
}

/**
 * What the Job looks like to a Footing right now: which Documents are attached and usable, and the
 * three texts as hashes. Never throws — it is read to decide whether a stored Footing is stale, and a
 * Job that can no longer be scored still has Footings worth showing.
 */
export function stampOf(job: FootingJob): FootingStamp {
  const resume = usableText(job.resume);
  const coverLetter = usableText(job.coverLetter);
  return {
    resumeId: resume?.id ?? null,
    coverLetterId: coverLetter?.id ?? null,
    resumeHash: hashText(resume?.text ?? ""),
    descriptionHash: hashText(job.description.trim()),
    coverLetterHash: hashText(coverLetter?.text ?? ""),
  };
}

/**
 * What a Footing is scored from, and the stamp to keep with it. The same two refusals a Job earns
 * before an interview can be prepared, in `readinessOf()`'s own vocabulary — refused here, before
 * anything is spent, because a two-line job description is the real cause of a low score and there is
 * no point paying to find that out.
 *
 * `Job.draft` is never read. Only an attached cover-letter **Document** is ever scored: scoring a
 * Draft would mean a number that moves every time the Tenant presses Rewrite.
 */
export async function footingSources(jobId: string): Promise<{ sources: FootingSources; stamp: FootingStamp }> {
  const { userId } = await requireSession();
  const job = await withTenant(userId, (_tx, tenant) => ownJob(tenant, jobId, FOOTING_SELECT));

  const resume = usableText(job.resume);
  if (!resume) throw new RuleError("no-resume", FOOTING_FAILURES["no-resume"]);
  if (!job.description.trim()) throw new RuleError("no-description", FOOTING_FAILURES["no-description"]);

  return {
    sources: {
      company: job.company,
      role: job.role,
      description: job.description,
      resumeText: resume.text,
      coverLetterText: usableText(job.coverLetter)?.text ?? "",
    },
    stamp: stampOf(job),
  };
}

/** The start of today in UTC — the day the ceiling counts, the same UTC day the quota weeks use. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** How many Footings this Tenant has stored today, across every Job. The breaker's input. */
export async function footingsToday(now: Date = new Date()): Promise<number> {
  const { userId } = await requireSession();
  return withTenant(userId, (tx) =>
    tx.footing.count({ where: { userId, scoredAt: { gte: startOfUtcDay(now) } } }),
  );
}

/**
 * The Footing and its dimensions in one transaction, so a Footing never exists with half a breakdown
 * behind it. An insert, always: nothing replaces a Footing.
 */
export async function storeFooting(
  jobId: string,
  stamp: FootingStamp,
  dimensions: FootingDimensionScore[],
  now: Date = new Date(),
): Promise<Footing> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx, tenant) => {
    const job = await ownJob(tenant, jobId, { id: true });
    return tx.footing.create({
      data: {
        userId,
        jobId: job.id,
        scoredAt: now,
        resumeId: stamp.resumeId,
        coverLetterId: stamp.coverLetterId,
        resumeHash: stamp.resumeHash,
        descriptionHash: stamp.descriptionHash,
        coverLetterHash: stamp.coverLetterHash,
        dimensions: {
          create: dimensions.map((scored) => ({
            userId,
            dimension: scored.dimension,
            score: scored.score,
            confidence: scored.confidence,
          })),
        },
      },
      include: { dimensions: true },
    });
  });
  // Just stored against the Job as it stands, so nothing has changed since it ran.
  return toFootingDto(row as FootingRow, []);
}

/**
 * The Job's newest Footing as it stands, for the sentence comparing a fresh one against it (footing
 * ticket 05). Read on its own rather than through `footingHistory`: nothing here needs the Job, the
 * earlier readings, or whether any of them is stale.
 */
export async function previousFooting(jobId: string): Promise<Footing | null> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.footing.findFirst({
      where: { userId, jobId },
      include: { dimensions: true },
      orderBy: [{ scoredAt: "desc" }, { id: "desc" }],
    }),
  );
  // Whether it is stale says nothing about how it compares, so nothing here works it out.
  return row ? toFootingDto(row, []) : null;
}

/** A Job's Footings, newest first, each told whether the Job has moved under it. */
export async function footingHistory(jobId: string): Promise<FootingHistory> {
  const { userId } = await requireSession();
  const { job, rows } = await withTenant(userId, async (tx, tenant) => ({
    job: await ownJob(tenant, jobId, FOOTING_SELECT),
    rows: await tx.footing.findMany({
      where: { userId, jobId },
      include: { dimensions: true },
      orderBy: [{ scoredAt: "desc" }, { id: "desc" }],
      take: FOOTING_HISTORY_MAX,
    }),
  }));

  const now = stampOf(job);
  const footings = rows.map((row) => toFootingDto(row as FootingRow, changedSince(toFootingStamp(row), now)));
  return { newest: footings[0] ?? null, earlier: footings.slice(1) };
}
