import type { Job, Stage } from "@/lib/jobs";
import type { JobPatchInput, NewJobInput } from "@/server/validation";

/**
 * What adding a Job sends, and what editing one may change: the validation schemas' own types, so a
 * new editable field is one schema edit (architecture ticket 07). The editable fields are the Job's
 * details — company, role, location, posting link, salary expectation — and the two free-text panels;
 * anything else on a Job changes only through a dedicated action (stage) or not at all (ticket 11).
 */
export type { NewJobInput };
export type JobPatch = JobPatchInput;

/**
 * What the board asks the world for. The provider talks to this and nothing else: Server Actions in
 * the app, the in-memory store in `tests/fakes/trail.ts` in component tests.
 */
export type JobsClient = {
  list(): Promise<Job[]>;
  add(input: NewJobInput): Promise<Job>;
  update(id: string, patch: JobPatch): Promise<Job>;
  setStage(id: string, stage: Stage): Promise<Job>;
};
