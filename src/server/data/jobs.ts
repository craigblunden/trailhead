import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Job, Stage } from "@/lib/jobs";
import { newJobFacts, stageChange } from "@/lib/jobs-rules";
import { requireSession } from "@/server/auth/session";
import { todayUtc } from "@/lib/dates";
import { dateColumnPatch, toDateColumn, toIsoDate, toJobDto } from "@/server/db/mappers";
import { withTenant, type Tenant, type TenantClient } from "@/server/db/tenant";
import { isChosenContact, type JobPatchInput, type NewJobInput } from "@/server/validation";

import { NotFoundError } from "./errors";

/**
 * The data access layer for jobs. Every function:
 * - calls `requireSession()` first — no caller ever supplies a `userId`;
 * - runs inside `withTenant()`, so row-level security scopes every statement;
 * - still names the owner in every `where`, because ownership lives in the query, never in a
 *   post-fetch comparison — a query that CAN return another user's row is a bug even when a
 *   check follows;
 * - returns DTOs from the mappers and throws typed domain errors. Prisma types stop here.
 *
 * It is also the one module that reads a Job back (architecture ticket 06). A data module whose write
 * hangs off a Job — a Contact link, a kit slot, a letter's sources — asks it, inside its own tenant
 * transaction, whether the Job is the Tenant's (`ownJob`) and for the Job as the board sees it
 * (`readJob`). The Job's query shape never leaves this file.
 */

/** The relations a Job DTO is built from — what `JobRow` describes. Contacts carry their link count for "Also on N other jobs". */
const JOB_INCLUDE = {
  activity: true,
  contacts: { include: { contact: { include: { _count: { select: { jobs: true } } } } } },
  resume: { select: { id: true, fileName: true } },
  coverLetter: { select: { id: true, fileName: true } },
} as const;

/**
 * For a write that hangs off a Job, inside the caller's tenant transaction: the fields `select` asks
 * for, if the Job is this Tenant's. A missing id and another user's id are the same `NotFoundError`.
 */
export async function ownJob<S extends Prisma.JobSelect>(
  tenant: Tenant,
  jobId: string,
  select: S,
): Promise<Prisma.JobGetPayload<{ select: S }>> {
  const job = await tenant.tx.job.findFirst({
    where: { id: jobId, userId: tenant.userId },
    select: select as Prisma.JobSelect,
  });
  if (!job) throw new NotFoundError();
  // Prisma cannot carry a generic `select` through to its result type; the row is what `select` asked for.
  return job as unknown as Prisma.JobGetPayload<{ select: S }>;
}

/** The Job as the board sees it, read inside the caller's tenant transaction — for a write that returns it. */
export async function readJob(tenant: Tenant, jobId: string): Promise<Job> {
  const row = await tenant.tx.job.findFirst({
    where: { id: jobId, userId: tenant.userId },
    include: JOB_INCLUDE,
  });
  if (!row) throw new NotFoundError();
  return toJobDto(row);
}

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
 * them must not leave a job with no history. What a new Job is — its Stage, dates, notes, accent,
 * and opening entry — is `newJobFacts`, the rule the board's optimistic update applies too. A
 * Contact typed into the same form is created and linked in that transaction, so the person is
 * never saved without the Job that was the reason for them; a Contact chosen from the user's own is
 * linked instead, which is how the form avoids saving the same person twice.
 */
export async function createJob(input: NewJobInput, now: Date = new Date()): Promise<Job> {
  const { userId } = await requireSession();

  const row = await withTenant(userId, async (tx) => {
    const existing = await tx.job.count({ where: { userId } });
    const { opening, ...facts } = newJobFacts(todayUtc(now), existing);
    const contactLink = await newJobContactLink(tx, userId, input.contact);
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
        stage: facts.stage,
        notes: facts.notes,
        addedOn: toDateColumn(facts.addedOn),
        appliedOn: facts.appliedOn,
        accent: facts.accent,
        activity: {
          create: { userId, label: opening.label, date: toDateColumn(opening.date) },
        },
        ...(contactLink ? { contacts: { create: contactLink } } : {}),
      },
      include: JOB_INCLUDE,
    });
  });
  return toJobDto(row);
}

/**
 * The `JobContact` row a new Job carries, nested inside its own create: the Contact chosen from the
 * user's own, or a new person made with the Job. A chosen id came from the browser, so the Contact
 * is named as this user's in the query rather than trusted — a foreign id is not found, and never
 * becomes a link row.
 */
async function newJobContactLink(
  tx: TenantClient,
  userId: string,
  contact: NewJobInput["contact"],
): Promise<Prisma.JobContactCreateWithoutJobInput | null> {
  if (!contact) return null;
  if (!isChosenContact(contact)) return { userId, contact: { create: { userId, ...contact } } };
  const own = await tx.contact.findFirst({
    where: { id: contact.contactId, userId },
    select: { id: true },
  });
  if (!own) throw new NotFoundError("contact");
  return { userId, contact: { connect: { id: own.id } } };
}

/** The applied date is the one patch field that isn't a column-ready scalar. */
function toColumns({ appliedOn, ...rest }: JobPatchInput) {
  return { ...rest, ...dateColumnPatch("appliedOn", appliedOn) };
}

/** The patch has already been through the allowlist; only its fields are written. */
export async function updateJob(id: string, patch: JobPatchInput): Promise<Job> {
  const { userId } = await requireSession();
  return withTenant(userId, async (tx, tenant) => {
    const { count } = await tx.job.updateMany({ where: { id, userId }, data: toColumns(patch) });
    if (count === 0) throw new NotFoundError();
    return readJob(tenant, id);
  });
}

/**
 * The read, the write, and the activity insert happen in one transaction. What changes is
 * `stageChange`'s decision: re-selecting the current stage writes nothing; a move adds "Moved to …"
 * dated today; leaving `interested` with no applied date backfills one; moving to `interested`
 * never sets one.
 *
 * The decision reads only the two columns it needs; the Job's relations are read once, after the write.
 */
export async function setJobStage(id: string, stage: Stage, now: Date = new Date()): Promise<Job> {
  const { userId } = await requireSession();
  const today = todayUtc(now);

  return withTenant(userId, async (tx, tenant) => {
    const current = await ownJob(tenant, id, { id: true, stage: true, appliedOn: true });

    const change = stageChange(
      { stage: current.stage, appliedOn: current.appliedOn ? toIsoDate(current.appliedOn) : null },
      stage,
      today,
    );
    if (!change.entry) return readJob(tenant, current.id);

    const row = await tx.job.update({
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
    return toJobDto(row);
  });
}
