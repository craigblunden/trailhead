"use server";

import type { Job } from "@/lib/jobs";
import { invalid, runAction as run, type ActionResult } from "@/server/action-result";
import { createJob, listJobs, setJobStage, updateJob } from "@/server/data/jobs";
import {
  idSchema,
  jobPatchSchema,
  newJobSchema,
  parseInput,
  stageSchema,
} from "@/server/validation";

export type { ActionFailure, ActionResult } from "@/server/action-result";

/**
 * Server Actions are the only write path from the client, and they are public POST endpoints:
 * every argument is `unknown` until validated. They hold no query logic and no `where` clause —
 * an action that grows a database call has found the wrong home for it. They return a
 * discriminated result (`src/server/action-result.ts`); nothing internal reaches the client.
 */

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
