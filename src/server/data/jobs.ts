import "server-only";

import type { Job, Stage } from "@/lib/jobs";
import { OPENING_ACTIVITY_LABEL, nextAccent, stageChange } from "@/lib/jobs-rules";
import { requireSession } from "@/server/auth/session";
import { todayUtc } from "@/lib/dates";
import { toDateColumn, toIsoDate, toJobDto, type JobRow } from "@/server/db/mappers";
import { withTenant } from "@/server/db/tenant";
import type { JobPatchInput, NewJobInput } from "@/server/validation";

import { NotFoundError } from "./errors";

/**
 * The data access layer for jobs. Every function:
 * - calls `requireSession()` first — no caller ever supplies a `userId`;
 * - runs inside `withTenant()`, so row-level security scopes every statement;
 * - still names the owner in every `where`, because ownership lives in the query, never in a
 *   post-fetch comparison — a query that CAN return another user's row is a bug even when a
 *   check follows;
 * - returns DTOs from the mappers and throws typed domain errors. Prisma types stop here.
 */

/** The relations a Job DTO is built from. Contacts carry their link count for "Also on N other jobs". */
export const JOB_INCLUDE = {
  activity: true,
  contacts: { include: { contact: { include: { _count: { select: { jobs: true } } } } } },
  resume: { select: { id: true, fileName: true } },
  coverLetter: { select: { id: true, fileName: true } },
} as const;

/** The board lists jobs in creation order, so reloads never reshuffle. */
export async function listJobs(): Promise<Job[]> {
  const { userId } = await requireSession();
  const rows = await withTenant(userId, (tx) =>
    tx.job.findMany({ where: { userId }, include: JOB_INCLUDE, orderBy: { createdAt: "asc" } }),
  );
  return rows.map(toJobDto);
}

/** Null for an unknown id and for another user's id alike. */
export async function getJob(id: string): Promise<Job | null> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.job.findFirst({ where: { id, userId }, include: JOB_INCLUDE }),
  );
  return row ? toJobDto(row) : null;
}

/**
 * One transaction writes the job and its single opening activity entry together: a crash between
 * them must not leave a job with no history. Starts at `interested`, dated today, with no applied
 * date, and its accent assigned by round-robin so the board keeps its Phase-1 variety.
 */
export async function createJob(input: NewJobInput, now: Date = new Date()): Promise<Job> {
  const { userId } = await requireSession();
  const today = toDateColumn(todayUtc(now));

  const row = await withTenant(userId, async (tx) => {
    const existing = await tx.job.count({ where: { userId } });
    return tx.job.create({
      data: {
        userId,
        company: input.company,
        role: input.role,
        location: input.location,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        postingUrl: input.postingUrl,
        description: input.description,
        stage: "interested",
        addedOn: today,
        appliedOn: null,
        accent: nextAccent(existing),
        activity: {
          create: { userId, label: OPENING_ACTIVITY_LABEL, date: today },
        },
      },
      include: JOB_INCLUDE,
    });
  });
  return toJobDto(row);
}

/** The patch has already been through the allowlist; only its fields are written. */
export async function updateJob(id: string, patch: JobPatchInput): Promise<Job> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const { count } = await tx.job.updateMany({ where: { id, userId }, data: patch });
    if (count === 0) throw new NotFoundError();
    return tx.job.findFirstOrThrow({ where: { id, userId }, include: JOB_INCLUDE });
  });
  return toJobDto(row);
}

/**
 * The read, the write, and the activity insert happen in one transaction. Re-selecting the
 * current stage writes nothing; a move prepends "Moved to …" dated today; leaving `interested`
 * with no applied date backfills one; moving to `interested` never sets one.
 */
export async function setJobStage(id: string, stage: Stage, now: Date = new Date()): Promise<Job> {
  const { userId } = await requireSession();
  const today = todayUtc(now);

  const row = await withTenant(userId, async (tx): Promise<JobRow> => {
    const current = await tx.job.findFirst({ where: { id, userId }, include: JOB_INCLUDE });
    if (!current) throw new NotFoundError();

    const change = stageChange(
      { stage: current.stage, appliedOn: current.appliedOn ? toIsoDate(current.appliedOn) : null },
      stage,
      today,
    );
    if (!change.entry) return current;

    return tx.job.update({
      where: { id: current.id, userId },
      data: {
        stage: change.stage,
        appliedOn: change.appliedOn ? toDateColumn(change.appliedOn) : null,
        activity: {
          create: { userId, label: change.entry.label, date: toDateColumn(change.entry.date) },
        },
      },
      include: JOB_INCLUDE,
    });
  });
  return toJobDto(row);
}
