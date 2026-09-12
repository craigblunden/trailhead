/**
 * Documents: files the user uploaded — a resume or a cover letter — owned by the user and sent with
 * as many Jobs as they like. Never versioned in place: a revised file is a new Document
 * (CONTEXT.md). Pure: shared by the server and the browser.
 */

import type { Limit } from "@/lib/plans";

/** The one private bucket Documents live in. Its policies and limits are in the provisioning migration. */
export const DOCUMENTS_BUCKET = "documents";

export const DOCUMENT_KINDS = ["resume", "cover_letter"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  resume: "Resume",
  cover_letter: "Cover letter",
};


/**
 * The largest upload, in bytes. The `documents` bucket's `file_size_limit` is what actually
 * enforces it — uploads go browser-direct, so no application code sees the bytes on the way in —
 * and the two must agree (`supabase/config.toml`, the provisioning migration).
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The only accepted types, by extension. The bucket's `allowed_mime_types` enforces the same set. */
export const ACCEPTED_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type DocumentExtension = keyof typeof ACCEPTED_TYPES;

/** For `<input type="file" accept>`. */
export const ACCEPT_ATTRIBUTE = ".pdf,.docx";

/**
 * Lifetime of a signed download URL, in seconds. Minted per view and never stored. Storage has no
 * default and no maximum, so this constant is the whole of the discipline (ticket 15: ≤ 300).
 */
export const DOWNLOAD_URL_TTL_SECONDS = 120;

/** `resume.PDF` → `pdf`; anything not accepted → null. */
export function extensionOf(fileName: string): DocumentExtension | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  const extension = match?.[1].toLowerCase();
  return extension === "pdf" || extension === "docx" ? extension : null;
}

/** A Document as the documents page and the job page show it. */
export type DocumentSummary = {
  id: string;
  kind: DocumentKind;
  fileName: string;
  sizeBytes: number;
  /** ISO `YYYY-MM-DD`. */
  uploadedOn: string;
  /** `pending` while the upload has not been confirmed and read; `ready` once it has. */
  status: "pending" | "ready";
  /** Jobs this Document is attached to, for "on N jobs" and the delete confirmation. */
  jobs: { id: string; company: string; role: string }[];
};

/** What the browser needs to put the file in storage itself. */
export type UploadTicket = {
  documentId: string;
  path: string;
  token: string;
  contentType: string;
};

/**
 * "Room for 2 more", or null: at a finite Limit, or under an unlimited one, where there is no
 * count to show. How many a Tenant may hold is its Plan's (`src/lib/plans.ts`), never a literal.
 */
export function roomLeft(count: number, limit: Limit): string | null {
  if (limit === "unlimited") return null;
  const left = limit - count;
  return left > 0 ? `Room for ${left} more` : null;
}

/** The refusal at a finite Limit, naming the Tenant's own number. */
export function limitReachedRefusal(limit: number): string {
  return `All ${limit} slots are used. Delete a document you no longer send, then upload this one.`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Why an upload was refused, as a code the server sends and the UI explains. Every message names
 * what to do next, because the user is standing there holding the file.
 */
export const UPLOAD_REFUSALS = {
  "unsupported-type": "Upload a PDF or a Word document (.docx).",
  "too-large": "That file is over the 5 MB limit. Export a smaller PDF, or remove large images, and upload that.",
  // The server sends this code with the Tenant's own number (`limitReachedRefusal`); this entry
  // names no number, so a caller with only the code never states someone else's Limit.
  "cap-reached": "All your document slots are used. Delete a document you no longer send, then upload this one.",
  "no-text-layer":
    "This PDF has no text in it — it looks like a scan or a picture of a page. Export it from the original document, or run it through text recognition (OCR), and upload that.",
  "password-protected":
    "This file is password-protected, so we can't read it. Save a copy without the password and upload that.",
  "type-mismatch":
    "This file isn't the kind its name says. Open it and save it again as a PDF or a .docx, then upload that.",
  unreadable:
    "We couldn't read this file — it may be damaged. Open it, save a fresh copy as a PDF or a .docx, and upload that.",
  "too-many-pages": "This PDF is over 20 pages. Upload just the resume or letter itself.",
  "too-much-text": "This file has far more text than a resume or letter. Upload just the resume or letter itself.",
  "upload-missing": "The file didn't finish uploading. Check your connection and try again.",
} as const;

export type UploadRefusal = keyof typeof UPLOAD_REFUSALS;

/** Why a Document cannot fill a Job's slot for the other kind, keyed by the slot (ticket 17). */
export const WRONG_KIND_REFUSALS: Record<DocumentKind, string> = {
  resume: "That is a cover letter, so it cannot be sent as this job’s resume.",
  cover_letter: "That is a resume, so it cannot be sent as this job’s cover letter.",
};
