import { vi } from "vitest";

import type { DocumentSummary } from "@/lib/documents";
import type { DocumentsClient, UploadStage } from "@/lib/documents-client";

/**
 * An in-memory DocumentsClient. `upload` walks through the same stages as the real one; a test can
 * make it refuse with `upload.mockRejectedValueOnce(new ActionError(...))`.
 */
export function createFakeDocumentsClient(initial: DocumentSummary[] = []) {
  let documents = [...initial];
  let sequence = 0;

  const client = {
    list: vi.fn(async () => documents),
    upload: vi.fn(async (file: File, kind: DocumentSummary["kind"], onStage?: (stage: UploadStage) => void) => {
      onStage?.("uploading");
      onStage?.("reading");
      const document: DocumentSummary = {
        id: `document-${++sequence}`,
        kind,
        fileName: file.name,
        sizeBytes: file.size,
        uploadedOn: "2026-07-25",
        status: "ready",
        jobs: [],
      };
      documents = [document, ...documents];
      return document;
    }),
    remove: vi.fn(async (id: string) => {
      documents = documents.filter((document) => document.id !== id);
    }),
    link: vi.fn(async (id: string) => `https://storage.example/signed/${id}?token=t`),
  } satisfies DocumentsClient;

  return client;
}

export function summary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-growth",
    kind: "resume",
    fileName: "resume_growth_v2.pdf",
    sizeBytes: 184_320,
    uploadedOn: "2026-07-11",
    status: "ready",
    jobs: [],
    ...overrides,
  };
}
