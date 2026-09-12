import "server-only";

import { randomUUID } from "node:crypto";

import {
  ACCEPTED_TYPES,
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
  UPLOAD_REFUSALS,
  WRONG_KIND_REFUSALS,
  capReachedRefusal,
  extensionOf,
  type DocumentKind,
  type DocumentSummary,
  type UploadRefusal,
  type UploadTicket,
} from "@/lib/documents";
import type { Job } from "@/lib/jobs";
import { DEFAULT_PLAN, limitsOf } from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import { DOCUMENT_SUMMARY_INCLUDE, toDocumentSummary } from "@/server/db/mappers";
import { withTenant } from "@/server/db/tenant";
import { extractDocumentText } from "@/server/ingest/extract";
import { logError } from "@/server/log";
import { documentsBucket } from "@/server/storage/documents-bucket";
import type { StartUploadInput } from "@/server/validation";

import { NotFoundError, RuleError } from "./errors";
import { ownJob, readJob } from "./jobs";

/**
 * The data access layer for Documents. Two systems hold a Document — a row in Postgres and an
 * object in Storage — with no transaction spanning them, so the order of operations is the design:
 *
 * - **Upload: row first.** A `pending` row (and its key) exists before a signed upload URL is minted,
 *   so nothing can land in the bucket that the database never knew about. The browser uploads
 *   directly; `finishUpload` reads the object back, extracts its text, and marks the row `ready`.
 * - **Delete: tombstone, then reconcile.** `deletedAt` is set first (the Document leaves every
 *   list at once), the object is removed through the Storage API, then the row is hard-deleted.
 *   Whatever a request does not finish, the sweep does. Removing a key that is already gone is a
 *   no-op, so every step is safe to repeat. Storage rows are never deleted with SQL.
 *
 * External calls — Storage, extraction — never run inside `withTenant()`: it holds a pooled
 * connection under a transaction timeout. Read in one transaction, call out, write in a second.
 */

/**
 * A `pending` row older than this lost its upload. A signed upload token lives 7200 s on the stack
 * this was verified against (ticket 01) and the application cannot shorten it, so the margin is
 * deliberate: reclaiming the row sooner could let a late upload land under a key nobody tracks.
 */
export const ABANDONED_UPLOAD_MS = 3 * 60 * 60 * 1000;

/**
 * Runs work the user does not wait on: removing objects from Storage. Inline by default, because the
 * data layer is also called outside any request (the integration suites); the document actions pass
 * one that runs the work after the response has been sent (performance ticket 03).
 */
export type Defer = (work: () => Promise<unknown>) => unknown;

const inline: Defer = (work) => work();

/** Newest first; tombstoned rows are gone from the user's point of view. */
export async function listDocuments(): Promise<DocumentSummary[]> {
  const { userId } = await requireSession();
  const rows = await withTenant(userId, (tx) =>
    tx.document.findMany({
      where: { userId, deletedAt: null, ingestion: { not: "failed" } },
      include: DOCUMENT_SUMMARY_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
  );
  return rows.map(toDocumentSummary);
}

/**
 * Creates the pending row, then mints a signed upload URL for its key. The cap is checked under a
 * per-user advisory lock, so two uploads started at once cannot both take the last slot.
 */
export async function startUpload(input: StartUploadInput, defer: Defer = inline): Promise<UploadTicket> {
  const { userId } = await requireSession();
  const extension = extensionOf(input.fileName);
  if (!extension) throw new RuleError("unsupported-type", UPLOAD_REFUSALS["unsupported-type"]);
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new RuleError("too-large", UPLOAD_REFUSALS["too-large"]);
  }

  // Abandoned uploads must not hold a slot the user is trying to use, so they are tombstoned before
  // the cap is counted. Removing objects — theirs, and any unfinished delete's — can wait.
  const tombstones = await tombstoneAbandoned(userId, new Date());
  await defer(() => finishDeleting(userId, tombstones));

  const row = await withTenant(userId, async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${userId}))`;
    const held = await tx.document.count({
      where: { userId, deletedAt: null, ingestion: { not: "failed" } },
    });
    // Every Tenant's Limit is the default Plan's until the Plan is read (plans issue 03).
    const limit = limitsOf(DEFAULT_PLAN).documents;
    if (limit !== "unlimited" && held >= limit) {
      throw new RuleError("cap-reached", capReachedRefusal(limit));
    }
    return tx.document.create({
      data: {
        userId,
        kind: input.kind,
        fileName: input.fileName,
        // `<userId>/<random>.<ext>`: the first segment carries the storage policy; the second is
        // unguessable and never the user's file name (research 04 §6).
        storageKey: `${userId}/${randomUUID()}.${extension}`,
        mimeType: ACCEPTED_TYPES[extension],
        sizeBytes: input.sizeBytes,
        ingestion: "pending",
      },
    });
  });

  const bucket = await documentsBucket();
  const { data, error } = await bucket.createSignedUploadUrl(row.storageKey);
  if (error || !data) {
    // No token was issued, so no object can exist: the row can simply go.
    await withTenant(userId, (tx) => tx.document.deleteMany({ where: { id: row.id, userId } }));
    throw new Error(`Minting a signed upload URL failed: ${error?.message ?? "no data"}`);
  }
  return { documentId: row.id, path: data.path, token: data.token, contentType: row.mimeType };
}

/**
 * Confirms an upload: reads the object back with the user's own session, extracts its text, and
 * marks the row `ready`. Idempotent for a row that is already ready.
 *
 * An upload that cannot be used — no text layer, locked, not what its name says — is not kept
 * (ticket 19): it is recorded as `failed` with its reason, then removed through the same
 * tombstone path as a delete, and the refusal names what to do. One owner, one outcome.
 */
export async function finishUpload(id: string): Promise<DocumentSummary> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.document.findFirst({ where: { id, userId, deletedAt: null }, include: DOCUMENT_SUMMARY_INCLUDE }),
  );
  if (!row) throw new NotFoundError("document");
  if (row.ingestion === "ready") return toDocumentSummary(row);

  const extension = extensionOf(row.storageKey);
  const bucket = await documentsBucket();
  const { data: blob, error } = await bucket.download(row.storageKey);
  if (error || !blob || !extension) return refuse(userId, id, "upload-missing");
  if (blob.size > MAX_UPLOAD_BYTES) return refuse(userId, id, "too-large");

  const extraction = await extractDocumentText(new Uint8Array(await blob.arrayBuffer()), extension);
  if (!extraction.ok) return refuse(userId, id, extraction.reason);

  const saved = await withTenant(userId, async (tx) => {
    const { count } = await tx.document.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ingestion: "ready",
        text: extraction.text,
        sizeBytes: blob.size,
        ingestionError: null,
      },
    });
    // Deleted while it was being read: it stays deleted.
    if (count === 0) throw new NotFoundError("document");
    return tx.document.findFirstOrThrow({ where: { id, userId }, include: DOCUMENT_SUMMARY_INCLUDE });
  });
  return toDocumentSummary(saved);
}

async function refuse(userId: string, id: string, reason: UploadRefusal): Promise<never> {
  await withTenant(userId, (tx) =>
    tx.document.updateMany({
      where: { id, userId, deletedAt: null },
      data: { ingestion: "failed", ingestionError: reason },
    }),
  );
  // If this does not run, the row is `failed`: out of the list, holding no slot, and reclaimed by
  // the sweep with the other unfinished uploads.
  const tombstoned = await tombstone(userId, id).catch((error: unknown) => {
    logError({ operation: "documents.refuseTombstone", tenant: userId }, error);
    return null;
  });
  if (tombstoned) await finishDeleting(userId, [tombstoned]);
  throw new RuleError(reason, UPLOAD_REFUSALS[reason]);
}

/**
 * Deletes a Document: it leaves the user's list immediately, the Jobs that referenced it keep
 * everything else, and its object is removed from Storage. If the object removal does not happen
 * in this request, the row stays tombstoned and the sweep finishes it.
 */
export async function deleteDocument(id: string, defer: Defer = inline): Promise<void> {
  const { userId } = await requireSession();
  const tombstoned = await tombstone(userId, id);
  await defer(() => finishDeleting(userId, [tombstoned]));
}

type Tombstoned = { id: string; storageKey: string; ingestion: string; createdAt: Date };

/**
 * One transaction: detach it from every Job, then mark it deleted. `ON DELETE SET NULL` would
 * detach it at the hard delete, but the Document must stop being attached the moment it is gone
 * from the user's view.
 */
async function tombstone(userId: string, id: string): Promise<Tombstoned> {
  return withTenant(userId, async (tx) => {
    // FOR UPDATE: an attach of this Document (setJobDocument) takes the same lock, so the two cannot
    // interleave and leave a Job pointing at a tombstone.
    await tx.$queryRaw`select id from "Document" where id = ${id} and "userId" = ${userId}::uuid for update`;
    const row = await tx.document.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, storageKey: true, ingestion: true, createdAt: true },
    });
    if (!row) throw new NotFoundError("document");
    await tx.job.updateMany({ where: { userId, resumeId: id }, data: { resumeId: null } });
    await tx.job.updateMany({ where: { userId, coverLetterId: id }, data: { coverLetterId: null } });
    await tx.document.update({ where: { id: row.id, userId }, data: { deletedAt: new Date() } });
    return row;
  });
}

/**
 * Removes the objects through the Storage API, then the rows. Never throws for the caller.
 *
 * Every tombstone is kept until its row's signed upload URL has expired (`ABANDONED_UPLOAD_MS`):
 * the token stays valid after the Document is deleted — even a Document that was ready — and a late
 * upload through it would land an object no row tracks. While the tombstone stays, every sweep removes whatever
 * arrived under its key, so the key is only forgotten once nothing more can arrive.
 */
async function finishDeleting(userId: string, rows: Tombstoned[], now: Date = new Date()): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const bucket = await documentsBucket();
    const { error } = await bucket.remove(rows.map((row) => row.storageKey));
    if (error) throw error;
  } catch (error) {
    // The tombstones stay; the sweep retries. The user already sees the Document gone.
    logError({ operation: "documents.removeObjects", tenant: userId }, error);
    return 0;
  }
  const settled = rows.filter((row) => row.createdAt.getTime() < now.getTime() - ABANDONED_UPLOAD_MS);
  if (settled.length === 0) return 0;
  const { count } = await withTenant(userId, (tx) =>
    tx.document.deleteMany({
      where: { id: { in: settled.map((row) => row.id) }, userId, deletedAt: { not: null } },
    }),
  );
  return count;
}

/**
 * The sweep, for the signed-in user: abandoned uploads are tombstoned, then every tombstone's
 * object is removed through the Storage API and its row deleted. Idempotent — running it twice over
 * the same tombstone is harmless, because removing a missing key is a no-op.
 *
 * It runs as the user because Storage checks the owner on every object operation and this
 * application holds no key that could act for anyone else. `pg_cron` runs the database half
 * (`public.sweep_documents()`): it finishes rows whose object is already gone and tombstones
 * abandoned uploads, and never touches `storage.objects` except to read it.
 */
export async function sweepMyDocuments(now: Date = new Date()): Promise<{ deleted: number }> {
  const { userId } = await requireSession();
  const tombstones = await tombstoneAbandoned(userId, now);
  return { deleted: await finishDeleting(userId, tombstones, now) };
}

/** Tombstones this user's abandoned uploads, then returns every tombstone still waiting to be finished. */
async function tombstoneAbandoned(userId: string, now: Date): Promise<Tombstoned[]> {
  return withTenant(userId, async (tx) => {
    await tx.document.updateMany({
      where: {
        userId,
        deletedAt: null,
        ingestion: { not: "ready" },
        createdAt: { lt: new Date(now.getTime() - ABANDONED_UPLOAD_MS) },
      },
      data: { deletedAt: now },
    });
    return tx.document.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true, storageKey: true, ingestion: true, createdAt: true },
    });
  });
}

/**
 * A signed download URL for one view, living `DOWNLOAD_URL_TTL_SECONDS`. Minting it is itself a
 * read checked by the storage policies, so another user's key is refused by Postgres, not by us.
 */
export async function documentDownloadUrl(id: string): Promise<string> {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.document.findFirst({
      where: { id, userId, deletedAt: null, ingestion: "ready" },
      select: { storageKey: true, fileName: true },
    }),
  );
  if (!row) throw new NotFoundError("document");

  const bucket = await documentsBucket();
  const { data, error } = await bucket.createSignedUrl(row.storageKey, DOWNLOAD_URL_TTL_SECONDS, {
    download: row.fileName,
  });
  if (error || !data) throw new Error(`Signing a download URL failed: ${error?.message ?? "no data"}`);
  return data.signedUrl;
}

/**
 * Attaches one of the user’s ready Documents to a Job as its resume or its cover letter, or clears
 * that slot with `null` (ticket 17). The two are separate references, so setting one never touches
 * the other. A Document of the other kind is refused by name; another user’s Document is the same
 * `NotFoundError` as a missing one — and the tenant policy on "Job" refuses both again in Postgres.
 */
export async function setJobDocument(
  jobId: string,
  kind: DocumentKind,
  documentId: string | null,
): Promise<Job> {
  const { userId } = await requireSession();
  return withTenant(userId, async (tx, tenant) => {
    const job = await ownJob(tenant, jobId, { id: true });
    if (documentId !== null) {
      // FOR UPDATE, like `tombstone`: a delete of this Document either waits for this attach (and then
      // detaches it) or finishes first (and this finds nothing). Never a Job pointing at a tombstone.
      const [document] = await tx.$queryRaw<{ kind: DocumentKind }[]>`
        select kind::text as kind from "Document"
         where id = ${documentId} and "userId" = ${userId}::uuid
           and "deletedAt" is null and ingestion = 'ready'
         for update`;
      if (!document) throw new NotFoundError("document");
      if (document.kind !== kind) throw new RuleError("wrong-kind", WRONG_KIND_REFUSALS[kind]);
    }
    await tx.job.update({
      where: { id: job.id, userId },
      data: kind === "resume" ? { resumeId: documentId } : { coverLetterId: documentId },
    });
    return readJob(tenant, job.id);
  });
}
