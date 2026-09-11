import "server-only";

import { SEED_JOBS, type Job } from "@/lib/jobs";

/**
 * The server side of the jobs query. Ticket 10 replaces the body with the data access layer;
 * until then the server prefetch resolves the same fixtures the browser client uses, so the
 * TanStack swap can be judged on its own.
 */
export async function listJobs(): Promise<Job[]> {
  return SEED_JOBS;
}
