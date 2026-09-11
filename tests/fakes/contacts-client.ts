import { vi } from "vitest";

import { ActionError } from "@/components/action-client";
import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import type { ContactFields, ContactsClient } from "@/lib/contacts-client";
import type { Job } from "@/lib/jobs";

export type StoredContact = ContactFields & { id: string };

const blank = { title: "", agency: "", email: "", phone: "", notes: "", linkedinUrl: "", lastSpokenOn: null };

/**
 * An in-memory ContactsClient over a fixed set of Jobs, applying the same rules as the server:
 * a Contact belongs to the user, a link is one row per (job, contact), unlinking removes only that
 * row. Every method is a `vi.fn`, so tests can assert what was asked for as well as what rendered.
 */
export function createFakeContactsClient({
  jobs,
  contacts = [],
}: {
  jobs: Job[];
  contacts?: Array<Partial<StoredContact> & Pick<StoredContact, "id" | "name" | "kind">>;
}) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  let store: StoredContact[] = contacts.map((contact) => ({ ...blank, ...contact }));
  const links = new Set<string>();
  let sequence = 0;

  for (const job of jobs) {
    for (const contact of job.contacts) {
      links.add(`${job.id}:${contact.id}`);
      if (!store.some((stored) => stored.id === contact.id)) {
        store.push({
          ...blank,
          id: contact.id,
          name: contact.name,
          kind: contact.kind,
          title: contact.title,
          agency: contact.agency,
          email: contact.email,
        });
      }
    }
  }

  const notFound = () => new ActionError("not-found", "This contact isn't on your trail.");
  const find = (id: string) => {
    const contact = store.find((candidate) => candidate.id === id);
    if (!contact) throw notFound();
    return contact;
  };
  const jobIdsOf = (contactId: string) =>
    [...links].filter((link) => link.endsWith(`:${contactId}`)).map((link) => link.split(":")[0]);
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en");

  const detail = (contact: StoredContact): ContactDetail => ({
    ...contact,
    jobs: jobIdsOf(contact.id).map((jobId) => {
      const job = jobsById.get(jobId)!;
      return { id: job.id, company: job.company, role: job.role, stage: job.stage };
    }),
  });
  const listItem = (contact: StoredContact): ContactListItem => ({
    id: contact.id,
    name: contact.name,
    kind: contact.kind,
    title: contact.title,
    agency: contact.agency,
    jobCount: jobIdsOf(contact.id).length,
  });
  const jobView = (jobId: string): Job => {
    const job = jobsById.get(jobId);
    if (!job) throw new ActionError("not-found", "This job isn't on your trail.");
    return {
      ...job,
      contacts: store
        .filter((contact) => links.has(`${jobId}:${contact.id}`))
        .sort(byName)
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          kind: contact.kind,
          title: contact.title,
          agency: contact.agency,
          email: contact.email,
          otherJobCount: jobIdsOf(contact.id).length - 1,
        })),
    };
  };

  const client = {
    list: vi.fn(async () => [...store].sort(byName).map(listItem)),
    get: vi.fn(async (id: string) => detail(find(id))),
    create: vi.fn(async (input: Pick<ContactFields, "name" | "kind">) => {
      const contact = { ...blank, ...input, id: `contact-${++sequence}` };
      store = [...store, contact];
      return detail(contact);
    }),
    update: vi.fn(async (id: string, patch: Partial<ContactFields>) => {
      const updated = { ...find(id), ...patch };
      store = store.map((contact) => (contact.id === id ? updated : contact));
      return detail(updated);
    }),
    remove: vi.fn(async (id: string) => {
      find(id);
      store = store.filter((contact) => contact.id !== id);
      for (const jobId of jobIdsOf(id)) links.delete(`${jobId}:${id}`);
    }),
    link: vi.fn(async (jobId: string, contactId: string) => {
      find(contactId);
      links.add(`${jobId}:${contactId}`);
      return jobView(jobId);
    }),
    unlink: vi.fn(async (jobId: string, contactId: string) => {
      links.delete(`${jobId}:${contactId}`);
      return jobView(jobId);
    }),
    createForJob: vi.fn(async (jobId: string, input: Pick<ContactFields, "name" | "kind">) => {
      const contact = { ...blank, ...input, id: `contact-${++sequence}` };
      store = [...store, contact];
      links.add(`${jobId}:${contact.id}`);
      return jobView(jobId);
    }),
  } satisfies ContactsClient;

  return client;
}
