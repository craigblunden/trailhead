import { queryOptions } from "@tanstack/react-query";

import {
  MAX_UPLOAD_BYTES,
  extensionOf,
  type DocumentKind,
  type DocumentSummary,
  type UploadRefusal,
} from "@/lib/documents";

/** Where an upload is, for the status line that announces it. */
export type UploadStage = "uploading" | "reading";

/** What the documents UI asks the world for. Tests inject a fake; the app uses actions + Storage. */
export type DocumentsClient = {
  list(): Promise<DocumentSummary[]>;
  /** Starts the upload, puts the bytes in Storage, and waits for the text to be read. */
  upload(file: File, kind: DocumentKind, onStage?: (stage: UploadStage) => void): Promise<DocumentSummary>;
  remove(id: string): Promise<void>;
  /** A short-lived download link for one view. */
  link(id: string): Promise<string>;
};

export const documentsCache = {
  key: ["documents"] as const,
  staleTime: 60_000,
  options: (fetchDocuments: () => Promise<DocumentSummary[]>) =>
    queryOptions({
      queryKey: documentsCache.key,
      queryFn: fetchDocuments,
      staleTime: documentsCache.staleTime,
    }),
};

/**
 * The checks the browser can make before anything is sent — the same rules the server and the
 * bucket enforce, run early so the refusal is instant. Convenience, not the contract.
 */
export function precheckFile(file: { name: string; size: number }): UploadRefusal | null {
  if (!extensionOf(file.name)) return "unsupported-type";
  if (file.size > MAX_UPLOAD_BYTES) return "too-large";
  return null;
}
