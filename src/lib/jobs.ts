import type { ContactKind } from "@/lib/contacts";
import type { DocumentKind } from "@/lib/documents";

export const STAGES = [
  "interested",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; dot: string }> = {
  interested: { label: "Interested", dot: "var(--stage-interested)" },
  applied: { label: "Applied", dot: "var(--stage-applied)" },
  interviewing: { label: "Interviewing", dot: "var(--stage-interviewing)" },
  offer: { label: "Offer", dot: "var(--stage-offer)" },
  rejected: { label: "Rejected", dot: "var(--stage-rejected)" },
};

/** A stage is "active" while the outcome is still open. */
export const ACTIVE_STAGES: Stage[] = [
  "interested",
  "applied",
  "interviewing",
  "offer",
];

export const ACCENTS = {
  moss: "#5c6b43",
  forest: "#4f6b3f",
  teal: "#3d6b6b",
  wheat: "#6b7340",
  olive: "#4a5c3a",
  slate: "#46688f",
} as const;

export type Accent = keyof typeof ACCENTS;

/** A Contact as it appears on a Job: enough for the sidebar row and its "also on" link. */
export type Contact = {
  id: string;
  name: string;
  kind: ContactKind;
  title: string;
  /** The independent firm they work for, when it differs from the company hiring. */
  agency: string;
  email: string;
  /** How many of the user's other Jobs this Contact is linked to. */
  otherJobCount: number;
};

/** A Document as a Job refers to it. */
export type AttachedDocument = { id: string; fileName: string };

export type ActivityEntry = {
  id: string;
  label: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
};

export type Job = {
  id: string;
  company: string;
  role: string;
  /** Free text as it reads on the card, e.g. "Hybrid · Brisbane". */
  location: string;
  /** Thousands per year. `null` on either end means the range is unknown. */
  salaryMin: number | null;
  salaryMax: number | null;
  stage: Stage;
  postingUrl: string;
  /** ISO `YYYY-MM-DD`. */
  addedOn: string;
  /** ISO `YYYY-MM-DD`, or `null` while the role is only a lead. */
  appliedOn: string | null;
  /** The resume sent with this Job, if one is attached. */
  resume: AttachedDocument | null;
  /** The cover letter sent with this Job, if one is attached. Separate from the resume (ticket 17). */
  coverLetter: AttachedDocument | null;
  description: string;
  notes: string;
  contacts: Contact[];
  activity: ActivityEntry[];
  accent: Accent;
};

/**
 * Dates are rendered from plain `YYYY-MM-DD` strings, which `Date` parses as
 * UTC. Formatting in UTC too keeps server and client output identical.
 */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatSalary(job: Pick<Job, "salaryMin" | "salaryMax">): string {
  const { salaryMin, salaryMax } = job;
  if (salaryMin === null && salaryMax === null) return "Salary TBD";
  if (salaryMin === null) return `Up to $${salaryMax}k`;
  if (salaryMax === null) return `From $${salaryMin}k`;
  return `$${salaryMin}k–$${salaryMax}k`;
}

/** The line under the card date: when it entered the pipeline, or when applied. */
export function timelineLabel(job: Job): string {
  return job.appliedOn
    ? `Applied ${formatShortDate(job.appliedOn)}`
    : `Added ${formatShortDate(job.addedOn)}`;
}

export function initials(company: string): string {
  return company.trim().charAt(0).toUpperCase();
}

/** "1 application" / "3 applications". */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Postings are user-supplied, and `<input type="url">` happily accepts
 * `javascript:` and `data:` schemes. Anything that is not an ordinary web link
 * yields `null`, and callers render no link at all.
 */
export function webLink(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** What a Job's application kit holds for one kind of Document. */
export function kitSlot(job: Job, kind: DocumentKind): AttachedDocument | null {
  return kind === "resume" ? job.resume : job.coverLetter;
}

/** The Job with one kit slot set, the other left as it was. */
export function withKitSlot(job: Job, kind: DocumentKind, value: AttachedDocument | null): Job {
  return kind === "resume" ? { ...job, resume: value } : { ...job, coverLetter: value };
}
