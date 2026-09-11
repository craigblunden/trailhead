import type {
  ActivityEntry as ActivityEntryRow,
  Contact as ContactRow,
  Document as DocumentRow,
  Job as JobModel,
  JobContact as JobContactRow,
} from "@/generated/prisma/client";
import type { ActivityEntry, Contact, Job } from "@/lib/jobs";

/**
 * Pure functions from database rows to the DTOs `src/lib/jobs.ts` defines. This is the boundary:
 * a Prisma model type never crosses out of `src/server/db/`. No database, no session — unit
 * tested with plain objects.
 */

/** A job row with the relations the detail page needs. */
export type JobRow = JobModel & {
  activity: ActivityEntryRow[];
  contacts: (JobContactRow & { contact: ContactRow })[];
  document: DocumentRow | null;
};

/**
 * A `date` column comes back as a `Date` at UTC midnight. The Phase-1 formatters parse exactly
 * `YYYY-MM-DD` and render in UTC, so this is the only shape that keeps server and client output
 * identical.
 */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The inverse: a `YYYY-MM-DD` string to the `Date` a `date` column expects. */
export function toDateColumn(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Today as a UTC calendar date — the same convention the Phase-1 prototype used, and the one the
 * formatters render in. Takes the clock as an argument so callers are testable without fake
 * timers.
 */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

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
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function toActivityDto(row: ActivityEntryRow): ActivityEntry {
  return { id: row.id, label: row.label, date: toIsoDate(row.date) };
}

/** Stable: by name, then id, so the detail view never reshuffles across reloads. */
export function sortContacts<T extends Pick<ContactRow, "id" | "name">>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function toContactDto(row: ContactRow): Contact {
  return { id: row.id, name: row.name, title: row.title, email: row.email };
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
    resumeFile: row.document?.fileName ?? null,
    description: row.description,
    notes: row.notes,
    contacts: sortContacts(row.contacts.map((link) => link.contact)).map(toContactDto),
    activity: sortActivity(row.activity).map(toActivityDto),
    accent: row.accent,
  };
}
