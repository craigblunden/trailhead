import type {
  ActivityEntry as ActivityEntryRow,
  Attempt as AttemptModel,
  AttemptQuestion as AttemptQuestionRow,
  Contact as ContactRow,
  Document as DocumentRow,
  Job as JobModel,
  JobContact as JobContactRow,
} from "@/generated/prisma/client";
import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import { isoDate } from "@/lib/dates";
import type { DocumentSummary } from "@/lib/documents";
import { ATTEMPT_LENGTHS, isAttemptLength, type Attempt } from "@/lib/interview";
import { STAGES, type ActivityEntry, type Contact, type Job } from "@/lib/jobs";

/**
 * Pure functions from database rows to the DTOs `src/lib/jobs.ts` defines. This is the boundary:
 * a Prisma model type never crosses out of `src/server/db/`. No database, no session — unit
 * tested with plain objects.
 */

/** A contact row with the number of Jobs it is linked to, as Prisma's `_count` returns it. */
export type CountedContactRow = ContactRow & { _count: { jobs: number } };

/** A job row with the relations the detail page needs. */
export type JobRow = JobModel & {
  activity: ActivityEntryRow[];
  contacts: (JobContactRow & { contact: CountedContactRow })[];
  resume: Pick<DocumentRow, "id" | "fileName"> | null;
  coverLetter: Pick<DocumentRow, "id" | "fileName"> | null;
};

/** A contact row with the Jobs it is linked to, for its own page. */
export type ContactDetailRow = ContactRow & {
  jobs: (JobContactRow & { job: Pick<JobModel, "id" | "company" | "role" | "stage"> })[];
};

/**
 * A `date` column comes back as a `Date` at UTC midnight. The Phase-1 formatters parse exactly
 * `YYYY-MM-DD` and render in UTC, so this is the only shape that keeps server and client output
 * identical.
 */
export function toIsoDate(value: Date): string {
  return isoDate(value);
}

/** The inverse: a `YYYY-MM-DD` string to the `Date` a `date` column expects. */
export function toDateColumn(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * One field of a patch — an optional, nullable `YYYY-MM-DD` — as the columns to spread into a
 * Prisma `data` object: absent from the patch means the key is absent here too, so the column is
 * left untouched; `null` clears it. Every optional date column a patch can carry (`appliedOn`,
 * `lastSpokenOn`) reads this way.
 */
export function dateColumnPatch<K extends string>(
  key: K,
  iso: string | null | undefined,
): Partial<Record<K, Date | null>> {
  if (iso === undefined) return {};
  return { [key]: iso === null ? null : toDateColumn(iso) } as Record<K, Date | null>;
}


/** The last tiebreak in every order: ids are unique, so an order that ends here is total. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Newest first by the user-visible date, then by creation time — the tiebreak that makes "newest
 * first" defined for two entries on the same day — then by id so the order is total.
 */
export function sortActivity<T extends Pick<ActivityEntryRow, "id" | "date" | "createdAt">>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      byId(a, b),
  );
}

export function toActivityDto(row: ActivityEntryRow): ActivityEntry {
  return { id: row.id, label: row.label, date: toIsoDate(row.date) };
}

/** Stable: by name, then id, so the detail view never reshuffles across reloads. */
export function sortContacts<T extends Pick<ContactRow, "id" | "name">>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => a.name.localeCompare(b.name, "en") || byId(a, b),
  );
}

/** A Contact on a Job. The link to this Job is one of its links, so "other" is one fewer. */
export function toContactDto(row: CountedContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    title: row.title,
    agency: row.agency,
    email: row.email,
    otherJobCount: Math.max(0, row._count.jobs - 1),
  };
}

export function toContactListItem(row: CountedContactRow): ContactListItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    title: row.title,
    agency: row.agency,
    jobCount: row._count.jobs,
  };
}

/**
 * Linked Jobs in pipeline order, then by company and role, then id — so "Roles with <name>"
 * groups by stage without the page having to sort, and never reshuffles.
 */
export function toContactDetail(row: ContactDetailRow): ContactDetail {
  const jobs = row.jobs
    .map((link) => link.job)
    .sort(
      (a, b) =>
        STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) ||
        a.company.localeCompare(b.company, "en") ||
        a.role.localeCompare(b.role, "en") ||
        byId(a, b),
    )
    .map((job) => ({ id: job.id, company: job.company, role: job.role, stage: job.stage }));

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    title: row.title,
    agency: row.agency,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    linkedinUrl: row.linkedinUrl,
    lastSpokenOn: row.lastSpokenOn ? toIsoDate(row.lastSpokenOn) : null,
    jobs,
  };
}

export function toJobDto(row: JobRow): Job {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    location: row.location,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    stage: row.stage,
    postingUrl: row.postingUrl,
    addedOn: toIsoDate(row.addedOn),
    appliedOn: row.appliedOn ? toIsoDate(row.appliedOn) : null,
    resume: row.resume ? { id: row.resume.id, fileName: row.resume.fileName } : null,
    coverLetter: row.coverLetter
      ? { id: row.coverLetter.id, fileName: row.coverLetter.fileName }
      : null,
    draft: row.draft,
    draftWrittenAt: row.draftWrittenAt ? row.draftWrittenAt.toISOString() : null,
    description: row.description,
    notes: row.notes,
    rejectionLetter: row.rejectionLetter,
    contacts: sortContacts(row.contacts.map((link) => link.contact)).map(toContactDto),
    activity: sortActivity(row.activity).map(toActivityDto),
    accent: row.accent,
  };
}

/**
 * What a document summary is read with, spread into the query: the Jobs it is attached to, as either
 * kind, and every column but `text`. The extracted text can run to the size of a whole file, and a
 * summary never shows it.
 */
export const DOCUMENT_SUMMARY_QUERY = {
  include: {
    resumeFor: { select: { id: true, company: true, role: true } },
    coverLetterFor: { select: { id: true, company: true, role: true } },
  },
  omit: { text: true },
} as const;

type JobLabel = Pick<JobModel, "id" | "company" | "role">;

export type DocumentSummaryRow = Omit<DocumentRow, "text"> & { resumeFor: JobLabel[]; coverLetterFor: JobLabel[] };

/** Only ready and pending Documents reach the user; a failed upload is removed where it failed. */
export function toDocumentSummary(row: DocumentSummaryRow): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    uploadedOn: toIsoDate(row.createdAt),
    status: row.ingestion === "ready" ? "ready" : "pending",
    jobs: [...row.resumeFor, ...row.coverLetterFor]
      .sort(
        (a, b) =>
          a.company.localeCompare(b.company, "en") ||
          a.role.localeCompare(b.role, "en") ||
          byId(a, b),
      )
      .map((job) => ({ id: job.id, company: job.company, role: job.role })),
  };
}

/** An Attempt row with its questions, in order — what an Attempt DTO is built from. */
export type AttemptRow = AttemptModel & { questions: AttemptQuestionRow[] };

/**
 * An Attempt as the page holds it. A question the Tenant was mid-way through when they navigated
 * away carries no Answer at all — it is never partly recorded — so `nextQuestion()` resumes on it
 * rather than inside it.
 *
 * A question carries an Answer once it has been answered **or** scored. The second half matters for
 * an Attempt the clock ended: its unreached questions were never answered, but they are still scored
 * (the scorer marks the silence), and the Scorecard has to be able to show that. Scores exist only
 * on a completed Attempt, so this can never make an in-progress one look answered.
 */
export function toAttemptDto(row: AttemptRow): Attempt {
  return {
    id: row.id,
    jobId: row.jobId,
    // The column is an integer; only `ATTEMPT_LENGTHS` are ever written to it (the routes refuse
    // anything else), so a row that somehow holds another number reads as the shortest Attempt.
    length: isAttemptLength(row.length) ? row.length : ATTEMPT_LENGTHS[0],
    activeSeconds: row.activeSeconds,
    completedAt: row.completedAt?.toISOString() ?? null,
    overallScore: row.overallScore,
    questions: [...row.questions]
      .sort((a, b) => a.order - b.order)
      .map((question) => ({
        id: question.id,
        category: question.category,
        order: question.order,
        text: question.text,
        ...(question.answeredAt || question.score !== null
          ? { answer: { transcript: question.transcript, score: question.score, rationale: question.rationale } }
          : {}),
      })),
  };
}
