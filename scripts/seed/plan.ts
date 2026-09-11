import type { ContactKind } from "@/lib/contacts";
import { isoDate } from "@/lib/dates";
import { ACCEPTED_TYPES, DOCUMENT_CAP, DOCUMENT_KIND_LABEL, extensionOf, type DocumentKind } from "@/lib/documents";
import { COVER_LETTER_QUOTA } from "@/lib/generation";
import type { Accent, ActivityEntry, Stage } from "@/lib/jobs";
import { newJobFacts, stageChange } from "@/lib/jobs-rules";
import {
  jobPatchSchema,
  newContactSchema,
  newJobSchema,
  parseInput,
  startUploadSchema,
} from "@/server/validation";

import { documentText, textPdf } from "./pdf";

/**
 * A seeded account, written as a story — "added three weeks ago, applied a week later" — and planned
 * into exactly the rows the app would have written if someone had done those things on those days.
 * Dates are relative to the day the seed runs, so the board always looks current.
 *
 * The rules are the app's own, never a second copy: history comes from `src/lib/jobs-rules.ts`, the
 * limits from `src/lib/`, and every field passes the same validation a Server Action applies. An
 * account the app could not have produced is refused before anything is written.
 */

export type SeedDocument = {
  /** How jobs in the same account refer to it. */
  key: string;
  kind: DocumentKind;
  fileName: string;
  /** The page's text, one line per line. */
  lines: readonly string[];
  uploadedDaysAgo: number;
};

export type SeedContact = {
  /** How jobs in the same account refer to it. */
  key: string;
  name: string;
  kind: ContactKind;
  title?: string;
  agency?: string;
  email?: string;
  phone?: string;
  notes?: string;
  linkedinUrl?: string;
  /** Null or absent: never recorded. */
  lastSpokenDaysAgo?: number | null;
};

export type SeedJob = {
  company: string;
  role: string;
  location: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  postingUrl?: string;
  description?: string;
  notes?: string;
  /** How many days before the seed runs the job was added to the board. */
  addedDaysAgo: number;
  /** Stage moves after it was added, oldest first. Each writes the history the board would. */
  moves?: readonly { stage: Stage; daysAgo: number }[];
  /** Keys of this account's contacts linked to the job. */
  contacts?: readonly string[];
  /** Key of this account's document sent as the job's resume. */
  resume?: string | null;
  /** Key of this account's document sent as the job's cover letter. */
  coverLetter?: string | null;
};

export type SeedAccount = {
  /** Also the email's local part. */
  key: string;
  name: string;
  /** False leaves the account signed up and never verified. */
  verified: boolean;
  /** What to look at when signed in as it. The seed prints it; planning ignores it. */
  about?: string;
  documents?: readonly SeedDocument[];
  contacts?: readonly SeedContact[];
  jobs?: readonly SeedJob[];
  /** Cover letters already taken from this week's quota. */
  lettersUsed?: number;
};

export type PlannedDocument = Omit<SeedDocument, "lines" | "uploadedDaysAgo"> & {
  mimeType: string;
  uploadedOn: string;
  /** What extraction at upload would have stored. */
  text: string;
  bytes: Uint8Array;
};

export type PlannedContact = Required<Omit<SeedContact, "lastSpokenDaysAgo">> & {
  lastSpokenOn: string | null;
};

export type PlannedJob = Required<Omit<SeedJob, "addedDaysAgo" | "moves" | "contacts">> & {
  contacts: string[];
  stage: Stage;
  addedOn: string;
  appliedOn: string | null;
  accent: Accent;
  /** Oldest first: the order the entries were written in. */
  activity: Omit<ActivityEntry, "id">[];
};

export type PlannedAccount = Pick<SeedAccount, "key" | "name" | "verified"> & {
  documents: PlannedDocument[];
  contacts: PlannedContact[];
  jobs: PlannedJob[];
  lettersUsed: number;
};

/** The `YYYY-MM-DD` that is `days` before `today`. */
export function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}

class SeedPlanError extends Error {
  name = "SeedPlanError";
}

function checkDaysAgo(where: string, days: number) {
  if (days < 0) throw new SeedPlanError(`${where}: a date in the future`);
}

/** The validation a Server Action would have applied, as one message per refused field. */
function checkValid(where: string, errors: Record<string, string> | null) {
  if (!errors) return;
  const fields = Object.entries(errors).map(([field, message]) => `${field}: ${message}`);
  throw new SeedPlanError(`${where}: ${fields.join("; ")}`);
}

function checkUniqueKeys(where: string, items: readonly { key: string }[]) {
  const seen = new Set<string>();
  for (const { key } of items) {
    if (seen.has(key)) throw new SeedPlanError(`${where}: the key "${key}" twice`);
    seen.add(key);
  }
}

function planDocument(document: SeedDocument, today: string, where: string): PlannedDocument {
  const at = `${where}, document "${document.key}"`;
  checkDaysAgo(at, document.uploadedDaysAgo);
  // The seed builds PDFs; a name that says otherwise would be refused at upload as a type mismatch.
  if (extensionOf(document.fileName) !== "pdf") throw new SeedPlanError(`${at}: the file name must end .pdf`);
  const bytes = textPdf(document.lines);
  const upload = parseInput(startUploadSchema, {
    kind: document.kind,
    fileName: document.fileName,
    sizeBytes: bytes.byteLength,
  });
  checkValid(at, upload.ok ? null : upload.errors);
  return {
    key: document.key,
    kind: document.kind,
    fileName: document.fileName,
    mimeType: ACCEPTED_TYPES.pdf,
    uploadedOn: daysBefore(today, document.uploadedDaysAgo),
    text: documentText(document.lines),
    bytes,
  };
}

function planContact(contact: SeedContact, today: string, where: string): PlannedContact {
  const at = `${where}, contact "${contact.key}"`;
  if (contact.lastSpokenDaysAgo !== undefined && contact.lastSpokenDaysAgo !== null) {
    checkDaysAgo(at, contact.lastSpokenDaysAgo);
  }
  const planned: PlannedContact = {
    key: contact.key,
    name: contact.name,
    kind: contact.kind,
    title: contact.title ?? "",
    agency: contact.agency ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    notes: contact.notes ?? "",
    linkedinUrl: contact.linkedinUrl ?? "",
    lastSpokenOn:
      contact.lastSpokenDaysAgo === undefined || contact.lastSpokenDaysAgo === null
        ? null
        : daysBefore(today, contact.lastSpokenDaysAgo),
  };
  // The schema is not strict, so `key` is ignored rather than refused.
  const parsed = parseInput(newContactSchema, planned);
  checkValid(at, parsed.ok ? null : parsed.errors);
  return planned;
}

/** What `createJob` writes, then what each `setJobStage` adds to it. */
function planJob(
  job: SeedJob,
  index: number,
  today: string,
  where: string,
  known: { contacts: Set<string>; documents: Map<string, DocumentKind> },
): PlannedJob {
  const at = `${where}, job "${job.company} — ${job.role}"`;
  checkDaysAgo(at, job.addedDaysAgo);

  const parsed = parseInput(newJobSchema, {
    company: job.company,
    role: job.role,
    location: job.location,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    postingUrl: job.postingUrl ?? "",
    description: job.description ?? "",
  });
  checkValid(at, parsed.ok ? null : parsed.errors);
  // Notes are not part of adding a job; they are written by editing it.
  const edit = parseInput(jobPatchSchema, { notes: job.notes ?? "" });
  checkValid(at, edit.ok ? null : edit.errors);

  const addedOn = daysBefore(today, job.addedDaysAgo);
  // What adding it wrote: the app's own new-Job facts, dated the day it was added, with the accent
  // the board assigns round-robin in the order jobs were added.
  const facts = newJobFacts(addedOn, index);
  let current: { stage: Stage; appliedOn: string | null } = { stage: facts.stage, appliedOn: facts.appliedOn };
  let lastDaysAgo = job.addedDaysAgo;
  const activity: PlannedJob["activity"] = [facts.opening];

  for (const move of job.moves ?? []) {
    checkDaysAgo(at, move.daysAgo);
    if (move.daysAgo > lastDaysAgo) {
      throw new SeedPlanError(`${at}: the move to ${move.stage} is dated before what came before it`);
    }
    const change = stageChange(current, move.stage, daysBefore(today, move.daysAgo));
    // The board writes nothing for a move to the stage a job is already in, so neither does a seed.
    if (!change.entry) throw new SeedPlanError(`${at}: the job is already ${move.stage}`);
    current = { stage: change.stage, appliedOn: change.appliedOn };
    activity.push(change.entry);
    lastDaysAgo = move.daysAgo;
  }

  for (const key of job.contacts ?? []) {
    if (!known.contacts.has(key)) throw new SeedPlanError(`${at}: no contact "${key}" in this account`);
  }
  const slots: [DocumentKind, string | null | undefined][] = [
    ["resume", job.resume],
    ["cover_letter", job.coverLetter],
  ];
  for (const [kind, key] of slots) {
    if (key === undefined || key === null) continue;
    const found = known.documents.get(key);
    if (!found) throw new SeedPlanError(`${at}: no document "${key}" in this account`);
    if (found !== kind) {
      throw new SeedPlanError(`${at}: document "${key}" is not a ${DOCUMENT_KIND_LABEL[kind].toLowerCase()}`);
    }
  }

  return {
    company: job.company,
    role: job.role,
    location: job.location,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    postingUrl: job.postingUrl ?? "",
    description: job.description ?? "",
    notes: job.notes ?? "",
    stage: current.stage,
    addedOn,
    appliedOn: current.appliedOn,
    accent: facts.accent,
    activity,
    contacts: [...(job.contacts ?? [])],
    resume: job.resume ?? null,
    coverLetter: job.coverLetter ?? null,
  };
}

/** Plans one account's rows for a seed run on `today` (`YYYY-MM-DD`, UTC), or refuses it. */
export function planAccount(account: SeedAccount, today: string): PlannedAccount {
  const where = `Seed account "${account.key}"`;
  const documents = account.documents ?? [];
  const contacts = account.contacts ?? [];
  const jobs = account.jobs ?? [];
  const lettersUsed = account.lettersUsed ?? 0;

  if (!account.verified && (documents.length > 0 || contacts.length > 0 || jobs.length > 0 || lettersUsed > 0)) {
    throw new SeedPlanError(`${where}: an unverified account has never signed in, so it can own nothing`);
  }
  if (documents.length > DOCUMENT_CAP) {
    throw new SeedPlanError(`${where}: an account holds at most ${DOCUMENT_CAP} documents`);
  }
  if (lettersUsed < 0 || lettersUsed > COVER_LETTER_QUOTA) {
    throw new SeedPlanError(`${where}: a week holds at most ${COVER_LETTER_QUOTA} cover letters`);
  }
  checkUniqueKeys(where, documents);
  checkUniqueKeys(where, contacts);

  const known = {
    contacts: new Set(contacts.map((contact) => contact.key)),
    documents: new Map(documents.map((document) => [document.key, document.kind])),
  };
  return {
    key: account.key,
    name: account.name,
    verified: account.verified,
    documents: documents.map((document) => planDocument(document, today, where)),
    contacts: contacts.map((contact) => planContact(contact, today, where)),
    jobs: jobs.map((job, index) => planJob(job, index, today, where, known)),
    lettersUsed,
  };
}
