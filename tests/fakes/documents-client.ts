import { vi } from "vitest";

import { ActionError } from "@/components/action-client";
import type { DocumentKind, DocumentSummary } from "@/lib/documents";
import type { DocumentsClient, UploadStage } from "@/lib/documents-client";
import { withKitSlot, type Job } from "@/lib/jobs";

/**
 * An in-memory DocumentsClient. `upload` walks through the same stages as the real one; a test can
 * make any method refuse with `mockRejectedValueOnce(new ActionError(...))`. `attach` applies the
 * server's rules: the Job and the Document must exist, and the kinds must match.
 */
export function createFakeDocumentsClient(
  initial: DocumentSummary[] = [],
  { jobs = [] }: { jobs?: Job[] } = {},
) {
  let documents = [...initial];
  const jobsById = new Map(jobs.map((job) => [job.id, { ...job }]));
  let sequence = 0;

  const client = {
    list: vi.fn(async () => documents),
    upload: vi.fn(async (file: File, kind: DocumentKind, onStage?: (stage: UploadStage) => void) => {
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
    attach: vi.fn(async (jobId: string, kind: DocumentKind, documentId: string | null) => {
      const job = jobsById.get(jobId);
      if (!job) throw new ActionError("not-found", "This job isn't on your trail.");
      const document = documents.find((candidate) => candidate.id === documentId);
      if (documentId !== null && !document) {
        throw new ActionError("not-found", "This document isn't on your trail.");
      }
      if (document && document.kind !== kind) {
        throw new ActionError("rejected", "That is the wrong kind of document.", {}, "wrong-kind");
      }
      const attached = document ? { id: document.id, fileName: document.fileName } : null;
      const updated = withKitSlot(job, kind, attached);
      jobsById.set(jobId, updated);
      documents = documents.map((candidate) => {
        const others = candidate.jobs.filter((entry) => entry.id !== jobId);
        const attachedHere =
          candidate.id === updated.resume?.id || candidate.id === updated.coverLetter?.id;
        return {
          ...candidate,
          jobs: attachedHere ? [...others, { id: job.id, company: job.company, role: job.role }] : others,
        };
      });
      return updated;
    }),
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
