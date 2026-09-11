import { queryOptions } from "@tanstack/react-query";

import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import type { Job } from "@/lib/jobs";
import type { NewContactInput } from "@/server/validation";

/**
 * Every field a Contact's own page edits: the validation schema's own type, so a new field is one
 * schema edit (architecture ticket 07). Validation on the server has the final say.
 */
export type ContactFields = NewContactInput;

/** What the contacts UI asks the world for. Tests inject a fake; the app uses Server Actions. */
export type ContactsClient = {
  list(): Promise<ContactListItem[]>;
  get(id: string): Promise<ContactDetail>;
  create(input: Pick<ContactFields, "name" | "kind">): Promise<ContactDetail>;
  update(id: string, patch: Partial<ContactFields>): Promise<ContactDetail>;
  /** Resolves once the Contact and its links are gone. */
  remove(id: string): Promise<unknown>;
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
