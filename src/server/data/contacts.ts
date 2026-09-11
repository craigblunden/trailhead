import "server-only";

import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import type { Job } from "@/lib/jobs";
import { requireSession } from "@/server/auth/session";
import { toContactDetail, toContactListItem, toDateColumn, toJobDto } from "@/server/db/mappers";
import { withTenant, type TenantClient } from "@/server/db/tenant";
import type { ContactPatchInput, NewContactInput } from "@/server/validation";

import { NotFoundError } from "./errors";
import { JOB_INCLUDE } from "./jobs";

/**
 * The data access layer for Contacts, on the same terms as jobs: the session supplies the owner,
 * every statement runs inside `withTenant()`, every `where` still names the owner, and a missing
 * id and another user's id throw the same `NotFoundError`.
 *
 * A Contact belongs to the user, not to a Job. Linking is a row in `JobContact`; unlinking removes
 * that row and nothing else, so the Contact and its other links survive.
 */

const DETAIL_INCLUDE = {
  jobs: { include: { job: { select: { id: true, company: true, role: true, stage: true } } } },
} as const;

const COUNT_INCLUDE = { _count: { select: { jobs: true } } } as const;

function toColumns<T extends Partial<NewContactInput>>(input: T) {
  const { lastSpokenOn, ...rest } = input;
  return {
    ...rest,
    ...(lastSpokenOn === undefined
      ? {}
      : { lastSpokenOn: lastSpokenOn === null ? null : toDateColumn(lastSpokenOn) }),
  };
}

/** By name, then id, so the list never reshuffles. */
export async function listContacts(): Promise<ContactListItem[]> {
  const { userId } = await requireSession();
  const rows = await withTenant(userId, (tx) =>
    tx.contact.findMany({
      where: { userId },
      include: COUNT_INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  );
  return rows.map(toContactListItem);
}

/** Null for an unknown id and for another user's id alike. */
export async function getContact(id: string): Promise<ContactDetail | null> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.contact.findFirst({ where: { id, userId }, include: DETAIL_INCLUDE }),
  );
  return row ? toContactDetail(row) : null;
}

export async function createContact(input: NewContactInput): Promise<ContactDetail> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.contact.create({ data: { userId, ...toColumns(input) }, include: DETAIL_INCLUDE }),
  );
  return toContactDetail(row);
}

/** Changing the kind edits this record in place: a recruiter who becomes the hiring manager is one Contact. */
export async function updateContact(id: string, patch: ContactPatchInput): Promise<ContactDetail> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    const { count } = await tx.contact.updateMany({ where: { id, userId }, data: toColumns(patch) });
    if (count === 0) throw new NotFoundError("contact");
    return tx.contact.findFirstOrThrow({ where: { id, userId }, include: DETAIL_INCLUDE });
  });
  return toContactDetail(row);
}

/** Removes the Contact and its links. The Jobs it was linked to are untouched. */
export async function deleteContact(id: string): Promise<void> {
  const { userId } = await requireSession();
  await withTenant(userId, async (tx) => {
    const { count } = await tx.contact.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundError("contact");
  });
}

async function requireJob(tx: TenantClient, userId: string, jobId: string) {
  const job = await tx.job.findFirst({ where: { id: jobId, userId }, select: { id: true } });
  if (!job) throw new NotFoundError();
}

async function readJob(tx: TenantClient, userId: string, jobId: string) {
  return tx.job.findFirstOrThrow({ where: { id: jobId, userId }, include: JOB_INCLUDE });
}

/** Links an existing Contact to a Job. Linking twice is harmless: there is one link row. */
export async function linkContact(jobId: string, contactId: string): Promise<Job> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    await requireJob(tx, userId, jobId);
    const contact = await tx.contact.findFirst({
      where: { id: contactId, userId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("contact");
    await tx.jobContact.createMany({
      data: [{ jobId, contactId, userId }],
      skipDuplicates: true,
    });
    return readJob(tx, userId, jobId);
  });
  return toJobDto(row);
}

/** Removes one link. The Contact and its links to other Jobs stay. */
export async function unlinkContact(jobId: string, contactId: string): Promise<Job> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    await requireJob(tx, userId, jobId);
    await tx.jobContact.deleteMany({ where: { jobId, contactId, userId } });
    return readJob(tx, userId, jobId);
  });
  return toJobDto(row);
}

/**
 * Creating from a Job asks only for name and kind (ticket 13), then links — in one transaction,
 * so a Contact is never created by this path without the link that was the reason for it.
 */
export async function createContactForJob(
  jobId: string,
  input: Pick<NewContactInput, "name" | "kind">,
): Promise<Job> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, async (tx) => {
    await requireJob(tx, userId, jobId);
    await tx.contact.create({
      data: { userId, name: input.name, kind: input.kind, jobs: { create: { jobId, userId } } },
    });
    return readJob(tx, userId, jobId);
  });
  return toJobDto(row);
}
