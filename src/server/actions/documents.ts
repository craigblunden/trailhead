"use server";

import { after } from "next/server";

import type { DocumentSummary, UploadTicket } from "@/lib/documents";
import type { Job } from "@/lib/jobs";
import { invalid, parseId, runAction, type ActionResult } from "@/server/action-result";
import {
  deleteDocument,
  documentDownloadUrl,
  finishUpload,
  listDocuments,
  setJobDocument,
  startUpload,
  type Defer,
} from "@/server/data/documents";
import { logError } from "@/server/log";
import { documentKindSchema, parseInput, startUploadSchema } from "@/server/validation";

/**
 * Document actions. None of them receives a file: an upload's bytes go from the browser straight
 * to Storage through a signed upload URL, because a request body through Vercel is capped at
 * 4.5 MB — below the 5 MB this application accepts.
 */

/**
 * Work the user does not wait on — removing objects from Storage — runs after the response has been
 * sent (performance ticket 03). A failure there is logged, never thrown: the Document stays
 * tombstoned, and the next sweep retries.
 */
function afterResponse(operation: string): Defer {
  return (work) => {
    after(() => work().catch((error: unknown) => logError({ operation }, error)));
  };
}

export async function listDocumentsAction(): Promise<ActionResult<DocumentSummary[]>> {
  return runAction("documents.list", () => listDocuments());
}

export async function startUploadAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  const parsed = parseInput(startUploadSchema, input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("documents.startUpload", () => startUpload(parsed.data, afterResponse("documents.startUpload.cleanup")));
}

export async function finishUploadAction(id: unknown): Promise<ActionResult<DocumentSummary>> {
  const document = parseId(id, "document");
  if (!document.ok) return document.failure;
  return runAction("documents.finishUpload", () => finishUpload(document.id));
}

export async function deleteDocumentAction(id: unknown): Promise<ActionResult<null>> {
  const document = parseId(id, "document");
  if (!document.ok) return document.failure;
  return runAction("documents.delete", async () => {
    await deleteDocument(document.id, afterResponse("documents.delete.cleanup"));
    return null;
  });
}

/** A short-lived link for one view. Never stored, never listed. */
export async function documentLinkAction(id: unknown): Promise<ActionResult<string>> {
  const document = parseId(id, "document");
  if (!document.ok) return document.failure;
  return runAction("documents.link", () => documentDownloadUrl(document.id));
}

/** Sets a Job's resume or cover letter to one of the user's Documents, or clears it with null. */
export async function setJobDocumentAction(
  jobId: unknown,
  kind: unknown,
  documentId: unknown,
): Promise<ActionResult<Job>> {
  const job = parseId(jobId, "job");
  if (!job.ok) return job.failure;
  const slot = parseInput(documentKindSchema, kind);
  if (!slot.ok) return invalid({ kind: slot.errors._form });
  // `null` clears the slot; anything else must be a well-formed id.
  const document = documentId === null ? null : parseId(documentId, "document");
  if (document && !document.ok) return document.failure;
  const attached = document ? document.id : null;
  return runAction("documents.attach", () => setJobDocument(job.id, slot.data, attached));
}
