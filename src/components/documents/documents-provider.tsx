"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { createActionsDocumentsClient } from "@/components/documents-actions-client";
import { describeFailure } from "@/components/action-client";
import { jobCache } from "@/components/job-cache";
import { UPLOAD_REFUSALS, type DocumentKind, type DocumentSummary } from "@/lib/documents";
import { documentsCache, limitsCache, precheckFile, type DocumentsClient } from "@/lib/documents-client";
import { withKitSlot } from "@/lib/jobs";

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

/** The Tenant's Limits, for showing a Document Limit before it is reached. */
export function useLimits() {
  const client = useDocumentsClient();
  return useQuery(limitsCache.options(() => client.limits()));
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
        queryClient.setQueryData<DocumentSummary[]>(documentsCache.key, (documents) => [
          document,
          ...(documents ?? []).filter((candidate) => candidate.id !== document.id),
        ]);
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

/**
 * A Job's application kit: its resume and its cover letter, each set independently (ticket 17).
 * Optimistic, like the rest of the job page, through the Job cache module: the choice shows at once,
 * and a refused one rolls back only its own slot.
 */
export function useJobDocuments(jobId: string) {
  const client = useDocumentsClient();
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);
  const [error, setError] = useState<string | null>(null);
  // The pick the user just made, per kind, held in React state so the radio moves within the click
  // itself; the jobs cache notifies a tick later. Cleared when the server settles.
  const [picked, setPicked] = useState<Partial<Record<DocumentKind, string | null>>>({});

  return {
    /**
     * Shows the choice synchronously — a controlled radio that waits even a microtask looks, to the
     * user and to assistive tech, as if the click did nothing — then asks the server.
     */
    choose: (kind: DocumentKind, documentId: string | null, fileName?: string) => {
      setError(null);
      setPicked((current) => ({ ...current, [kind]: documentId }));
      const name =
        fileName ??
        queryClient
          .getQueryData<DocumentSummary[]>(documentsCache.key)
          ?.find((candidate) => candidate.id === documentId)?.fileName;
      const attached = documentId ? { id: documentId, fileName: name ?? "" } : null;

      void cache
        .update(jobId, {
          apply: (job) => withKitSlot(job, kind, attached),
          send: () => client.attach(jobId, kind, documentId),
          fallback: ATTACH_FAILED,
        })
        .then((result) => {
          if (!result.ok) setError(result.message);
          setPicked((current) => {
            const next = { ...current };
            delete next[kind];
            return next;
          });
          // "On N jobs" changed.
          void queryClient.invalidateQueries({ queryKey: documentsCache.key });
        });
    },
    /** What the kit should show as chosen for `kind`: the pending pick, else what is attached. */
    selected: (kind: DocumentKind, attachedId: string | null) =>
      picked[kind] !== undefined ? (picked[kind] ?? null) : attachedId,
    error,
    dismissError: () => setError(null),
  };
}

/** Delete and download. Deleting detaches the Document from its Jobs, so the jobs are resynced too. */
export function useDocumentActions() {
  const client = useDocumentsClient();
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);

  const remove = useMutation({
    mutationFn: (id: string) => client.remove(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DocumentSummary[]>(documentsCache.key, (documents) =>
        documents?.filter((document) => document.id !== id),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: documentsCache.key });
      cache.refresh();
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
