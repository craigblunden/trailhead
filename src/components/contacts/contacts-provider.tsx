"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { ActionError, unwrapping } from "@/components/action-client";
import { jobCache } from "@/components/job-cache";
import type { ContactDetail } from "@/lib/contacts";
import { contactsCache, type ContactFields, type ContactsClient } from "@/lib/contacts-client";
import type { Job } from "@/lib/jobs";
import {
  createContactAction,
  createContactForJobAction,
  deleteContactAction,
  getContactAction,
  linkContactAction,
  listContactsAction,
  unlinkContactAction,
  updateContactAction,
} from "@/server/actions/contacts";

/**
 * Contacts state lives in TanStack Query under `contactsCache`, like jobs. This provider only
 * says where contacts come from and go to — Server Actions by default, an in-memory store in tests.
 * The hooks below are the whole client-side surface.
 *
 * Contacts writes are not optimistic. They are rare, deliberate, and each one changes two caches
 * at once (a Job's contacts and the contact list), so the UI shows a pending state and then what
 * the server actually wrote — into the jobs cache through the Job cache module, like every write to
 * a Job.
 */

/** Contacts over Server Actions — the only write path from the browser. */
const defaultClient: ContactsClient = {
  list: unwrapping(listContactsAction),
  get: unwrapping(getContactAction),
  create: unwrapping(createContactAction),
  update: unwrapping(updateContactAction),
  remove: unwrapping(deleteContactAction),
  link: unwrapping(linkContactAction),
  unlink: unwrapping(unlinkContactAction),
  createForJob: unwrapping(createContactForJobAction),
};

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
 * wrote it, which the Job cache module swaps in; the contact list is refetched because its role
 * counts changed.
 */
export function useJobContactLinks(jobId: string) {
  const client = useContactsClient();
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);

  /** Sends one change and says whether it was saved; a failure's message is already set. */
  const write = useCallback(
    async (send: () => Promise<Job>) => {
      setInFlight((count) => count + 1);
      const result = await cache.update(jobId, { send, fallback: LINK_FAILED });
      setInFlight((count) => count - 1);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      setError(null);
      void queryClient.invalidateQueries({ queryKey: contactsCache.listKey });
      return true;
    },
    [cache, jobId, queryClient],
  );

  return {
    /** Resolves true once linked; false if it failed (the error is already set). */
    link: (contactId: string) => write(() => client.link(jobId, contactId)),
    unlink: (contactId: string) => void write(() => client.unlink(jobId, contactId)),
    create: (input: Pick<ContactFields, "name" | "kind">) => write(() => client.createForJob(jobId, input)),
    pending: inFlight > 0,
    error,
    dismissError: () => setError(null),
  };
}

/** Creating, editing, and deleting a Contact on its own page. */
export function useContactMutations() {
  const client = useContactsClient();
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);

  const refreshLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contactsCache.listKey, exact: true });
    // A Job's contact rows show the name and kind, so they may have changed too.
    cache.refresh();
  }, [cache, queryClient]);

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
