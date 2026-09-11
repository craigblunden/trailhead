import { queryOptions } from "@tanstack/react-query";

import type { ContactDetail, ContactKind, ContactListItem } from "@/lib/contacts";
import type { Job } from "@/lib/jobs";

/** Every field a Contact's own page edits. Validation on the server has the final say. */
export type ContactFields = {
  name: string;
  kind: ContactKind;
  title: string;
  agency: string;
  email: string;
  phone: string;
  notes: string;
  linkedinUrl: string;
  /** ISO `YYYY-MM-DD`, or null for never recorded. */
  lastSpokenOn: string | null;
};

/** What the contacts UI asks the world for. Tests inject a fake; the app uses Server Actions. */
export type ContactsClient = {
  list(): Promise<ContactListItem[]>;
  get(id: string): Promise<ContactDetail>;
  create(input: Pick<ContactFields, "name" | "kind">): Promise<ContactDetail>;
  update(id: string, patch: Partial<ContactFields>): Promise<ContactDetail>;
  remove(id: string): Promise<void>;
  /** The link operations return the Job, so the job page can show the change at once. */
  link(jobId: string, contactId: string): Promise<Job>;
  unlink(jobId: string, contactId: string): Promise<Job>;
  createForJob(jobId: string, input: Pick<ContactFields, "name" | "kind">): Promise<Job>;
};

/**
 * The contacts queries' identity, defined once for the server prefetch and the client read, like
 * `jobsCache`. Free of server-only and client-only imports on purpose.
 */
export const contactsCache = {
  listKey: ["contacts"] as const,
  detailKey: (id: string) => ["contacts", id] as const,
  staleTime: 60_000,

  listOptions: (fetchList: () => Promise<ContactListItem[]>) =>
    queryOptions({
      queryKey: contactsCache.listKey,
      queryFn: fetchList,
      staleTime: contactsCache.staleTime,
    }),

  detailOptions: (id: string, fetchDetail: () => Promise<ContactDetail>) =>
    queryOptions({
      queryKey: contactsCache.detailKey(id),
      queryFn: fetchDetail,
      staleTime: contactsCache.staleTime,
    }),
};
