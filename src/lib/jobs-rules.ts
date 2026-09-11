import { ACCENTS, STAGE_META, type Accent, type ActivityEntry, type Job, type Stage } from "@/lib/jobs";

/**
 * The Phase-1 rules for how a job changes, as pure functions. Both the optimistic update in the
 * browser and the fixture client use these, so what the user sees the instant they act is what the
 * server will confirm. The server re-derives the same rules in the data layer; a divergence shows
 * up as a visible correction after the round trip, which is the point.
 */

const ACCENT_KEYS = Object.keys(ACCENTS) as Accent[];

/** Round-robin over the accent keys keeps the board's visual variety. */
export function nextAccent(existingCount: number): Accent {
  return ACCENT_KEYS[existingCount % ACCENT_KEYS.length];
}

export const OPENING_ACTIVITY_LABEL = "Added to board — Interested";

export function movedToLabel(stage: Stage): string {
  return `Moved to ${STAGE_META[stage].label}`;
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
