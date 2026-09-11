"use server";

import type { Job } from "@/lib/jobs";
import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { createJob, listJobs, setJobStage, updateJob } from "@/server/data/jobs";
import { logError } from "@/server/log";
import {
  idSchema,
  jobPatchSchema,
  newJobSchema,
  parseInput,
  stageSchema,
  type FieldErrors,
} from "@/server/validation";

/**
 * Server Actions are the only write path from the client, and they are public POST endpoints:
 * every argument is `unknown` until validated. They hold no query logic and no `where` clause —
 * an action that grows a database call has found the wrong home for it. They return a
 * discriminated result; a Prisma error, a stack trace, a constraint name, or a column name never
 * reaches the client.
 */

export type ActionFailure = {
  ok: false;
  error: "unauthenticated" | "invalid" | "not-found" | "failed";
  /** Safe to show the user as-is. */
  message: string;
  fields?: FieldErrors;
};

export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

const MESSAGES = {
  unauthenticated: "Your session has ended. Sign in again to continue.",
  invalid: "Check the highlighted fields.",
  "not-found": "This job isn't on your trail.",
  failed: "Something went wrong on our side. Your changes weren't saved — please try again.",
} as const;

function invalid(fields: FieldErrors): ActionFailure {
  return { ok: false, error: "invalid", message: MESSAGES.invalid, fields };
}

/** Runs a data-layer call and turns whatever it throws into a result the client may see. */
async function run<T>(operation: string, work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      // An action cannot redirect the way a render can; the client re-authenticates.
      return { ok: false, error: "unauthenticated", message: MESSAGES.unauthenticated };
    }
    if (error instanceof NotFoundError) {
      return { ok: false, error: "not-found", message: MESSAGES["not-found"] };
    }
    const session = await getOptionalSession().catch(() => null);
    logError({ operation, tenant: session?.userId ?? null }, error);
    return { ok: false, error: "failed", message: MESSAGES.failed };
  }
}

export async function listJobsAction(): Promise<ActionResult<Job[]>> {
  return run("jobs.list", () => listJobs());
}

export async function createJobAction(input: unknown): Promise<ActionResult<Job>> {
  const parsed = parseInput(newJobSchema, input);
  if (!parsed.ok) return invalid(parsed.errors);
  return run("jobs.create", () => createJob(parsed.data));
}

export async function updateJobAction(id: unknown, patch: unknown): Promise<ActionResult<Job>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown job" });
  const parsedPatch = parseInput(jobPatchSchema, patch);
  if (!parsedPatch.ok) return invalid(parsedPatch.errors);
  return run("jobs.update", () => updateJob(parsedId.data, parsedPatch.data));
}

export async function setJobStageAction(id: unknown, stage: unknown): Promise<ActionResult<Job>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown job" });
  const parsedStage = parseInput(stageSchema, stage);
  if (!parsedStage.ok) return invalid({ stage: "Unknown stage" });
  return run("jobs.setStage", () => setJobStage(parsedId.data, parsedStage.data));
}
