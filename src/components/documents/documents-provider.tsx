"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useState } from "react";

import { createActionsDocumentsClient } from "@/components/documents-actions-client";
import { ActionError } from "@/components/jobs-actions-client";
import { UPLOAD_REFUSALS, type DocumentKind, type DocumentSummary } from "@/lib/documents";
import { documentsCache, precheckFile, type DocumentsClient } from "@/lib/documents-client";
import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";

const defaultClient: DocumentsClient = createActionsDocumentsClient();

const DocumentsClientContext = createContext<DocumentsClient>(defaultClient);

export function DocumentsProvider({
  children,
  client = defaultClient,
}: {
  children: React.ReactNode;
  client?: DocumentsClient;
}) {
  return <DocumentsClientContext.Provider value={client}>{children}</DocumentsClientContext.Provider>;
}

function useDocumentsClient() {
  return useContext(DocumentsClientContext);
}

export function useDocumentList() {
  const client = useDocumentsClient();
  return useQuery(documentsCache.options(() => client.list()));
}

/** What went wrong, in words written for the user: a field message, a rule's message, or a fallback. */
export function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof ActionError) {
    return Object.values(error.fields)[0] ?? error.message;
  }
  return fallback;
}

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" | "reading"; fileName: string }
  | { phase: "done"; fileName: string; document: DocumentSummary }
  | { phase: "failed"; fileName: string; message: string };

/**
 * One upload at a time, with a state the UI announces as it changes. Refusals the browser can see
 * coming (type, size) are made before anything is sent.
 */
export function useDocumentUpload({ onUploaded }: { onUploaded?: (document: DocumentSummary) => void } = {}) {
  const client = useDocumentsClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const upload = useCallback(
    async (file: File, kind: DocumentKind) => {
      const refusal = precheckFile(file);
      if (refusal) {
        setState({ phase: "failed", fileName: file.name, message: UPLOAD_REFUSALS[refusal] });
        return;
      }
      setState({ phase: "uploading", fileName: file.name });
      try {
        const document = await client.upload(file, kind, (stage) =>
          setState({ phase: stage, fileName: file.name }),
        );
        setState({ phase: "done", fileName: file.name, document });
        onUploaded?.(document);
      } catch (error) {
        setState({
          phase: "failed",
          fileName: file.name,
          message: describeFailure(error, "That upload didn't work. Check your connection and try again."),
        });
      } finally {
        void queryClient.invalidateQueries({ queryKey: documentsCache.key });
      }
    },
    [client, onUploaded, queryClient],
  );

  return { state, upload, reset: () => setState({ phase: "idle" }) };
}

const ATTACH_FAILED = "That change wasn’t saved. Check your connection and try again.";

/** One choice in the kit, carrying the jobs cache as it was, to restore if the server refuses. */
type Choice = { kind: DocumentKind; documentId: string | null; previous: Job[] | undefined };

/**
 * A Job's application kit: its resume and its cover letter, each set independently (ticket 17).
 * Optimistic, like the rest of the job page: the choice shows at once and rolls back visibly if the
 * server refuses it.
 */
export function useJobDocuments(jobId: string) {
  const client = useDocumentsClient();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // The pick the user just made, per kind, held in React state so the radio moves within the click
  // itself; the jobs cache notifies a tick later. Cleared when the server settles.
  const [picked, setPicked] = useState<Partial<Record<DocumentKind, string | null>>>({});

  const choose = useMutation({
    mutationFn: async ({ kind, documentId }: Choice) => {
      await queryClient.cancelQueries({ queryKey: jobsCache.key });
      return client.attach(jobId, kind, documentId);
    },
    onError: (failure, { previous }) => {
      queryClient.setQueryData(jobsCache.key, previous);
      setError(describeFailure(failure, ATTACH_FAILED));
    },
    onSuccess: (job) => {
      queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) =>
        jobs?.map((candidate) => (candidate.id === job.id ? job : candidate)),
      );
    },
    onSettled: (_job, _failure, { kind }) => {
      setPicked((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      // "On N jobs" changed.
      void queryClient.invalidateQueries({ queryKey: documentsCache.key });
    },
  });

  return {
    /**
     * Shows the choice synchronously — a controlled radio that waits even a microtask looks, to the
     * user and to assistive tech, as if the click did nothing — then asks the server.
     */
    choose: (kind: DocumentKind, documentId: string | null) => {
      setError(null);
      setPicked((current) => ({ ...current, [kind]: documentId }));
      const previous = queryClient.getQueryData<Job[]>(jobsCache.key);
      const document = queryClient
        .getQueryData<DocumentSummary[]>(documentsCache.key)
        ?.find((candidate) => candidate.id === documentId);
      const attached = documentId && document ? { id: documentId, fileName: document.fileName } : null;
      queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) =>
        jobs?.map((job) =>
          job.id !== jobId
            ? job
            : kind === "resume"
              ? { ...job, resume: attached }
              : { ...job, coverLetter: attached },
        ),
      );
      choose.mutate({ kind, documentId, previous });
    },
    /** What the kit should show as chosen for `kind`: the pending pick, else what is attached. */
    selected: (kind: DocumentKind, attachedId: string | null) =>
      picked[kind] !== undefined ? (picked[kind] ?? null) : attachedId,
    error,
    dismissError: () => setError(null),
  };
}

/** Delete and download. Deleting detaches the Document from its Jobs, so jobs are refetched too. */
export function useDocumentActions() {
  const client = useDocumentsClient();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => client.remove(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DocumentSummary[]>(documentsCache.key, (documents) =>
        documents?.filter((document) => document.id !== id),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: documentsCache.key });
      void queryClient.invalidateQueries({ queryKey: jobsCache.key });
    },
  });

  /** Mints a link for this one view and follows it; the link carries `download`, so the page stays. */
  const open = useCallback(
    async (id: string) => {
      window.location.assign(await client.link(id));
    },
    [client],
  );

  return { remove, open };
}
