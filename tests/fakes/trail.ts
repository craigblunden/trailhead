import { vi } from "vitest";

import { ActionError } from "@/components/action-client";
import type { ContactDetail, ContactKind, ContactListItem } from "@/lib/contacts";
import type { ContactFields, ContactsClient } from "@/lib/contacts-client";
import { todayUtc } from "@/lib/dates";
import { WRONG_KIND_REFUSALS, type DocumentKind, type DocumentSummary } from "@/lib/documents";
import type { DocumentsClient, UploadStage } from "@/lib/documents-client";
import { STAGES, withKitSlot, type Contact, type Job, type Stage } from "@/lib/jobs";
import type { JobPatch, JobsClient, NewJobInput } from "@/lib/jobs-client";
import { movedJob, newJob } from "@/lib/jobs-rules";
import { DEFAULT_PLAN, limitsOf, type Plan } from "@/lib/plans";
import { NotFoundError, RuleError } from "@/server/data/errors";
import { sortContacts } from "@/server/db/mappers";

/**
 * The one in-memory store the component tests run against (architecture ticket 05): Jobs, Contacts,
 * Documents, and the links between them, behind all three client interfaces. What one client changes
 * is what the other two read, so a test can follow a change across entities — a Contact linked on a
 * Job's page is in that Contact's count of roles; a Document attached to a Job is in that Document's
 * "on N jobs".
 *
 * It applies the app's own rules, not copies of them: a new Job and a Stage move come from the Job
 * rules, orderings from the mappers, and refusals carry the messages the server's actions send.
 * Every method is a `vi.fn`, so a test can assert what was asked for, or make one call refuse with
 * `mockRejectedValueOnce(new ActionError(…))`.
 */

type StoredContact = ContactFields & { id: string };

/** A Document on file. Which Jobs it is attached to is read from the Jobs, never stored twice. */
export type StoredDocument = Omit<DocumentSummary, "jobs">;

/** A Contact to start with: an id, a name, and a kind, and any other field. */
export type ContactSeed = Partial<ContactFields> & { id: string; name: string; kind: ContactKind };

const BLANK_CONTACT = {
  title: "",
  agency: "",
  email: "",
  phone: "",
  notes: "",
  linkedinUrl: "",
  lastSpokenOn: null,
} satisfies Omit<ContactFields, "name" | "kind">;

/** What a Server Action sends the browser for this domain error, thrown the way the client throws it. */
function refused(error: NotFoundError | RuleError): ActionError {
  return error instanceof NotFoundError
    ? new ActionError("not-found", error.shown)
    : new ActionError("rejected", error.message, {}, error.code);
}

type JobLabel = Pick<Job, "id" | "company" | "role">;

/** By company, then role, then id — the order the mappers give a Document's and a Contact's Jobs. */
function byCompanyThenRole(a: JobLabel, b: JobLabel): number {
  return (
    a.company.localeCompare(b.company, "en") ||
    a.role.localeCompare(b.role, "en") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function createTrail({
  jobs = [],
  contacts = [],
  documents = [],
  plan = DEFAULT_PLAN,
}: { jobs?: Job[]; contacts?: ContactSeed[]; documents?: StoredDocument[]; plan?: Plan } = {}) {
  let storedJobs: Job[] = jobs.map((job) => ({ ...job, contacts: [] }));
  let storedContacts: StoredContact[] = contacts.map((contact) => ({ ...BLANK_CONTACT, ...contact }));
  let storedDocuments: StoredDocument[] = [...documents];
  /** One entry per (Job, Contact) pair, as the link table holds them. */
  const links = new Set<string>();
  const counters = new Map<string, number>();

  const nextId = (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
  const linkOf = (jobId: string, contactId: string) => `${jobId} ${contactId}`;

  // The Contacts on the Jobs it starts with seed the store: each person once, linked to every Job
  // they appear on.
  for (const job of jobs) {
    for (const contact of job.contacts) {
      links.add(linkOf(job.id, contact.id));
      if (!storedContacts.some((stored) => stored.id === contact.id)) {
        const { id, name, kind, title, agency, email } = contact;
        storedContacts.push({ ...BLANK_CONTACT, id, name, kind, title, agency, email });
      }
    }
  }

  const jobsLinkedTo = (contactId: string) => storedJobs.filter((job) => links.has(linkOf(job.id, contactId)));

  const jobView = (job: Job): Job => ({
    ...job,
    contacts: sortContacts(storedContacts.filter((contact) => links.has(linkOf(job.id, contact.id)))).map(
      ({ id, name, kind, title, agency, email }): Contact => ({
        id,
        name,
        kind,
        title,
        agency,
        email,
        // This Job's link is one of them, so "other" is one fewer.
        otherJobCount: Math.max(0, jobsLinkedTo(id).length - 1),
      }),
    ),
  });

  const documentView = (document: StoredDocument): DocumentSummary => ({
    ...document,
    jobs: storedJobs
      .filter((job) => job.resume?.id === document.id || job.coverLetter?.id === document.id)
      .sort(byCompanyThenRole)
      .map(({ id, company, role }) => ({ id, company, role })),
  });

  const contactDetail = (contact: StoredContact): ContactDetail => ({
    ...contact,
    jobs: jobsLinkedTo(contact.id)
      .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || byCompanyThenRole(a, b))
      .map(({ id, company, role, stage }) => ({ id, company, role, stage })),
  });

  const listItem = ({ id, name, kind, title, agency }: StoredContact): ContactListItem => ({
    id,
    name,
    kind,
    title,
    agency,
    jobCount: jobsLinkedTo(id).length,
  });

  const findJob = (id: string) => {
    const job = storedJobs.find((candidate) => candidate.id === id);
    if (!job) throw refused(new NotFoundError());
    return job;
  };
  const findContact = (id: string) => {
    const contact = storedContacts.find((candidate) => candidate.id === id);
    if (!contact) throw refused(new NotFoundError("contact"));
    return contact;
  };
  const saveJob = (next: Job) => {
    storedJobs = storedJobs.map((job) => (job.id === next.id ? next : job));
    return jobView(next);
  };
  const saveContact = (next: StoredContact) => {
    storedContacts = storedContacts.map((contact) => (contact.id === next.id ? next : contact));
    return contactDetail(next);
  };
  const addContact = (input: Pick<ContactFields, "name" | "kind">) => {
    const contact: StoredContact = { ...BLANK_CONTACT, ...input, id: nextId("contact") };
    storedContacts = [...storedContacts, contact];
    return contact;
  };

  const jobsClient = {
    list: vi.fn(async () => storedJobs.map(jobView)),
    add: vi.fn(async (input: NewJobInput) => {
      const job = newJob(input, { today: todayUtc(), existingCount: storedJobs.length, newId: () => nextId("job") });
      storedJobs = [...storedJobs, job];
      return jobView(job);
    }),
    update: vi.fn(async (id: string, patch: JobPatch) => saveJob({ ...findJob(id), ...patch })),
    setStage: vi.fn(async (id: string, stage: Stage) =>
      saveJob(movedJob(findJob(id), stage, todayUtc(), () => nextId("entry"))),
    ),
  } satisfies JobsClient;

  const contactsClient = {
    list: vi.fn(async () => sortContacts(storedContacts).map(listItem)),
    get: vi.fn(async (id: string) => contactDetail(findContact(id))),
    create: vi.fn(async (input: Pick<ContactFields, "name" | "kind">) => contactDetail(addContact(input))),
    update: vi.fn(async (id: string, patch: Partial<ContactFields>) => saveContact({ ...findContact(id), ...patch })),
    remove: vi.fn(async (id: string) => {
      findContact(id);
      storedContacts = storedContacts.filter((contact) => contact.id !== id);
      for (const job of storedJobs) links.delete(linkOf(job.id, id));
      return null;
    }),
    link: vi.fn(async (jobId: string, contactId: string) => {
      const job = findJob(jobId);
      findContact(contactId);
      links.add(linkOf(jobId, contactId));
      return jobView(job);
    }),
    unlink: vi.fn(async (jobId: string, contactId: string) => {
      const job = findJob(jobId);
      links.delete(linkOf(jobId, contactId));
      return jobView(job);
    }),
    createForJob: vi.fn(async (jobId: string, input: Pick<ContactFields, "name" | "kind">) => {
      const job = findJob(jobId);
      links.add(linkOf(jobId, addContact(input).id));
      return jobView(job);
    }),
  } satisfies ContactsClient;

  const documentsClient = {
    list: vi.fn(async () => storedDocuments.map(documentView)),
    limits: vi.fn(async () => limitsOf(plan)),
    upload: vi.fn(async (file: File, kind: DocumentKind, onStage?: (stage: UploadStage) => void) => {
      onStage?.("uploading");
      onStage?.("reading");
      const document: StoredDocument = {
        id: nextId("document"),
        kind,
        fileName: file.name,
        sizeBytes: file.size,
        uploadedOn: todayUtc(),
        status: "ready",
      };
      storedDocuments = [document, ...storedDocuments];
      return documentView(document);
    }),
    remove: vi.fn(async (id: string) => {
      if (!storedDocuments.some((document) => document.id === id)) throw refused(new NotFoundError("document"));
      storedDocuments = storedDocuments.filter((document) => document.id !== id);
      // Deleting detaches it from every Job, and each Job keeps everything else.
      storedJobs = storedJobs.map((job) => ({
        ...job,
        resume: job.resume?.id === id ? null : job.resume,
        coverLetter: job.coverLetter?.id === id ? null : job.coverLetter,
      }));
      return null;
    }),
    link: vi.fn(async (id: string) => `https://storage.example/signed/${id}?token=t`),
    attach: vi.fn(async (jobId: string, kind: DocumentKind, documentId: string | null) => {
      const job = findJob(jobId);
      if (documentId === null) return saveJob(withKitSlot(job, kind, null));
      const document = storedDocuments.find((candidate) => candidate.id === documentId && candidate.status === "ready");
      if (!document) throw refused(new NotFoundError("document"));
      if (document.kind !== kind) throw refused(new RuleError("wrong-kind", WRONG_KIND_REFUSALS[kind]));
      return saveJob(withKitSlot(job, kind, { id: document.id, fileName: document.fileName }));
    }),
  } satisfies DocumentsClient;

  return {
    jobs: jobsClient,
    contacts: contactsClient,
    documents: documentsClient,
    /** The Jobs as the board reads them right now, for seeding a cache before the first render. */
    jobsNow: () => storedJobs.map(jobView),
  };
}

export type Trail = ReturnType<typeof createTrail>;

/** A ready Document on file, with anything overridden. */
export function summary(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: "doc-growth",
    kind: "resume",
    fileName: "resume_growth_v2.pdf",
    sizeBytes: 184_320,
    uploadedOn: "2026-07-11",
    status: "ready",
    ...overrides,
  };
}
