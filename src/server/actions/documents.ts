"use server";

import type { DocumentSummary, UploadTicket } from "@/lib/documents";
import type { Job } from "@/lib/jobs";
import { invalid, runAction, type ActionResult } from "@/server/action-result";
import {
  deleteDocument,
  documentDownloadUrl,
  finishUpload,
  listDocuments,
  setJobDocument,
  startUpload,
} from "@/server/data/documents";
import {
  idSchema,
  jobDocumentSchema,
  parseInput,
  startUploadSchema,
} from "@/server/validation";

/**
 * Document actions. None of them receives a file: an upload's bytes go from the browser straight
 * to Storage through a signed upload URL, because a request body through Vercel is capped at
 * 4.5 MB — below the 5 MB this application accepts.
 */

export async function listDocumentsAction(): Promise<ActionResult<DocumentSummary[]>> {
  return runAction("documents.list", () => listDocuments());
}

export async function startUploadAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  const parsed = parseInput(startUploadSchema, input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("documents.startUpload", () => startUpload(parsed.data));
}

export async function finishUploadAction(id: unknown): Promise<ActionResult<DocumentSummary>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown document" });
  return runAction("documents.finishUpload", () => finishUpload(parsedId.data));
}

export async function deleteDocumentAction(id: unknown): Promise<ActionResult<null>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown document" });
  return runAction("documents.delete", async () => {
    await deleteDocument(parsedId.data);
    return null;
  });
}

/** A short-lived link for one view. Never stored, never listed. */
export async function documentLinkAction(id: unknown): Promise<ActionResult<string>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown document" });
  return runAction("documents.link", () => documentDownloadUrl(parsedId.data));
}

/** Sets a Job's resume or cover letter to one of the user's Documents, or clears it with null. */
export async function setJobDocumentAction(
  jobId: unknown,
  kind: unknown,
  documentId: unknown,
): Promise<ActionResult<Job>> {
  const parsed = parseInput(jobDocumentSchema, { jobId, kind, documentId });
  if (!parsed.ok) return invalid(parsed.errors);
  const { jobId: job, kind: slot, documentId: document } = parsed.data;
  return runAction("documents.attach", () => setJobDocument(job, slot, document));
}
