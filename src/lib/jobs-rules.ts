import {
  ACCENTS,
  STAGE_META,
  type Accent,
  type ActivityEntry,
  type Contact,
  type Job,
  type Stage,
} from "@/lib/jobs";

/**
 * The rules for how a Job comes to be and how it changes, as pure functions. They answer with the
 * whole next Job, so a store that holds Jobs in memory — the browser's optimistic update, and the
 * in-memory store the component tests run against — applies them as they are and cannot assemble a
 * different Job. The data layer writes what the same rules decide from what the database holds; a
 * divergence shows up as a visible correction after the round trip, which is the point.
 */

const ACCENT_KEYS = Object.keys(ACCENTS) as Accent[];

/** Optimistic ids are stamped so a stray one is recognisable in a bug report. */
export function optimisticId(): string {
  return `optimistic-${crypto.randomUUID()}`;
}

/** Round-robin over the accent keys keeps the board's visual variety. */
export function nextAccent(existingCount: number): Accent {
  return ACCENT_KEYS[existingCount % ACCENT_KEYS.length];
}

export const OPENING_ACTIVITY_LABEL = "Added to board — Interested";

/** The Activity entry a write leaves (feedback issue 01): one spelling for the data layer, the card, and the tests. */
export const COVER_LETTER_WRITTEN_LABEL = "Cover letter written";
export const COVER_LETTER_REWRITTEN_LABEL = "Cover letter rewritten";

export function coverLetterLabel(rewrite: boolean): string {
  return rewrite ? COVER_LETTER_REWRITTEN_LABEL : COVER_LETTER_WRITTEN_LABEL;
}

export function movedToLabel(stage: Stage): string {
  return `Moved to ${STAGE_META[stage].label}`;
}

/** What the user types when adding a Job. Everything else about a new Job is decided here. */
export type NewJobFields = Pick<
  Job,
  "company" | "role" | "location" | "salaryMin" | "salaryMax" | "postingUrl" | "description"
>;

/** A new Job apart from what the user typed and the ids a store assigns. */
export type NewJobFacts = {
  stage: "interested";
  addedOn: string;
  appliedOn: null;
  notes: string;
  resume: null;
  coverLetter: null;
  draft: "";
  draftWrittenAt: null;
  contacts: Contact[];
  accent: Accent;
  /** The one Activity entry a new Job starts with. */
  opening: Omit<ActivityEntry, "id">;
};

/**
 * A new Job starts at `interested`, dated today, with no applied date, no notes, an empty application
 * kit, no Draft, no Contacts, and one opening Activity entry. Its accent comes round-robin from how many Jobs
 * the user already has.
 */
export function newJobFacts(today: string, existingCount: number): NewJobFacts {
  return {
    stage: "interested",
    addedOn: today,
    appliedOn: null,
    notes: "",
    resume: null,
    coverLetter: null,
    draft: "",
    draftWrittenAt: null,
    contacts: [],
    accent: nextAccent(existingCount),
    opening: { label: OPENING_ACTIVITY_LABEL, date: today },
  };
}

/** The whole new Job, for a store that holds Jobs in memory and assigns its own ids. */
export function newJob(
  fields: NewJobFields,
  { today, existingCount, newId }: { today: string; existingCount: number; newId: () => string },
): Job {
  const { opening, ...facts } = newJobFacts(today, existingCount);
  return { ...fields, ...facts, id: newId(), activity: [{ id: newId(), ...opening }] };
}

export type StageChange = {
  stage: Stage;
  appliedOn: string | null;
  /** The entry to prepend, or null when nothing changed. */
  entry: Omit<ActivityEntry, "id"> | null;
};

/**
 * - Moving to the stage a job is already in is a no-op: no duplicate activity entry.
 * - A move prepends a "Moved to …" entry dated today.
 * - Moving OFF `interested` with no applied date on file backfills one. Moving TO `interested`
 *   never sets one. An existing applied date is never touched.
 */
export function stageChange(
  job: Pick<Job, "stage" | "appliedOn">,
  stage: Stage,
  today: string,
): StageChange {
  if (job.stage === stage) {
    return { stage, appliedOn: job.appliedOn, entry: null };
  }
  return {
    stage,
    appliedOn: job.appliedOn ?? (stage === "interested" ? null : today),
    entry: { label: movedToLabel(stage), date: today },
  };
}

/**
 * The whole Job after moving it to `stage` on `today`: the Stage and applied date `stageChange`
 * decides, with its "Moved to …" entry prepended. Re-selecting the current Stage returns the same Job.
 */
export function movedJob(job: Job, stage: Stage, today: string, newId: () => string): Job {
  const change = stageChange(job, stage, today);
  if (!change.entry) return job;
  return {
    ...job,
    stage: change.stage,
    appliedOn: change.appliedOn,
    activity: [{ id: newId(), ...change.entry }, ...job.activity],
  };
}

/**
 * The whole Job after a letter was written for it on `today`: the Draft replaced, and the write's
 * Activity entry prepended — "Cover letter written", or "…rewritten" when it came from Feedback. The
 * data layer writes the same two things in one transaction; the card applies this to the cached Job
 * when the route answers, so the letter region and the Activity list agree without a refetch.
 */
export function withDraft(
  job: Job,
  { letter, rewrite, writtenAt, today }: { letter: string; rewrite: boolean; writtenAt: string; today: string },
  newId: () => string,
): Job {
  return {
    ...job,
    draft: letter,
    draftWrittenAt: writtenAt,
    activity: [{ id: newId(), label: coverLetterLabel(rewrite), date: today }, ...job.activity],
  };
}
