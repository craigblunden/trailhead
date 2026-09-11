"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useState } from "react";

import { createActionsContactsClient } from "@/components/contacts-actions-client";
import { ActionError } from "@/components/jobs-actions-client";
import type { ContactDetail } from "@/lib/contacts";
import { contactsCache, type ContactFields, type ContactsClient } from "@/lib/contacts-client";
import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";

/**
 * Contacts state lives in TanStack Query under `contactsCache`, like jobs. This provider only
 * says where contacts come from and go to — Server Actions by default, a fake in tests. The hooks
 * below are the whole client-side surface.
 *
 * Contacts writes are not optimistic. They are rare, deliberate, and each one changes two caches
 * at once (a Job's contacts and the contact list), so the UI shows a pending state and then what
 * the server actually wrote.
 */

const defaultClient: ContactsClient = createActionsContactsClient();

const ContactsClientContext = createContext<ContactsClient>(defaultClient);

export function ContactsProvider({
  children,
  client = defaultClient,
}: {
  children: React.ReactNode;
  client?: ContactsClient;
}) {
  return <ContactsClientContext.Provider value={client}>{children}</ContactsClientContext.Provider>;
}

function useContactsClient(): ContactsClient {
  return useContext(ContactsClientContext);
}

/** An action's own message is written to be shown; anything else gets the fallback. */
export function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ActionError ? error.message : fallback;
}

/** Retrying cannot turn "not yours" or "signed out" into anything else. */
function retryUnlessFinal(failureCount: number, error: unknown): boolean {
  if (error instanceof ActionError && (error.kind === "not-found" || error.kind === "unauthenticated")) {
    return false;
  }
  return failureCount < 2;
}

export function useContactList({ enabled = true }: { enabled?: boolean } = {}) {
  const client = useContactsClient();
  return useQuery({
    ...contactsCache.listOptions(() => client.list()),
    enabled,
    retry: retryUnlessFinal,
  });
}

export function useContactDetail(id: string) {
  const client = useContactsClient();
  return useQuery({
    ...contactsCache.detailOptions(id, () => client.get(id)),
    retry: retryUnlessFinal,
  });
}

const LINK_FAILED = "That change wasn't saved. Check your connection and try again.";

/**
 * Linking, unlinking, and creating-then-linking from a Job. Each returns the Job as the server
 * wrote it, which replaces that Job in the jobs cache; the contact list is refetched because its
 * role counts changed.
 */
export function useJobContactLinks(jobId: string) {
  const client = useContactsClient();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(
    (job: Job) => {
      setError(null);
      queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) =>
        jobs?.map((candidate) => (candidate.id === job.id ? job : candidate)),
      );
      void queryClient.invalidateQueries({ queryKey: contactsCache.listKey });
    },
    [queryClient],
  );
  const onError = useCallback((failure: unknown) => setError(failureMessage(failure, LINK_FAILED)), []);

  const link = useMutation({
    mutationFn: (contactId: string) => client.link(jobId, contactId),
    onSuccess,
    onError,
  });
  const unlink = useMutation({
    mutationFn: (contactId: string) => client.unlink(jobId, contactId),
    onSuccess,
    onError,
  });
  const create = useMutation({
    mutationFn: (input: Pick<ContactFields, "name" | "kind">) => client.createForJob(jobId, input),
    onSuccess,
    onError,
  });

  return {
    /** Resolves true once linked; false if it failed (the error is already set). */
    link: (contactId: string) =>
      link.mutateAsync(contactId).then(
        () => true,
        () => false,
      ),
    unlink: (contactId: string) => unlink.mutate(contactId),
    create: (input: Pick<ContactFields, "name" | "kind">) =>
      create.mutateAsync(input).then(
        () => true,
        () => false,
      ),
    pending: link.isPending || unlink.isPending || create.isPending,
    error,
    dismissError: () => setError(null),
  };
}

/** Creating, editing, and deleting a Contact on its own page. */
export function useContactMutations() {
  const client = useContactsClient();
  const queryClient = useQueryClient();

  const refreshLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contactsCache.listKey, exact: true });
    // A Job's contact rows show the name and kind, so they may have changed too.
    void queryClient.invalidateQueries({ queryKey: jobsCache.key });
  }, [queryClient]);

  const remember = useCallback(
    (detail: ContactDetail) => {
      queryClient.setQueryData(contactsCache.detailKey(detail.id), detail);
      refreshLists();
    },
    [queryClient, refreshLists],
  );

  const create = useMutation({
    mutationFn: (input: Pick<ContactFields, "name" | "kind">) => client.create(input),
    onSuccess: remember,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ContactFields> }) =>
      client.update(id, patch),
    onSuccess: remember,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.remove(id),
    onSuccess: refreshLists,
  });

  return { create, update, remove };
}
