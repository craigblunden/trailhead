import { queryOptions } from "@tanstack/react-query";

import type { Job } from "@/lib/jobs";

/**
 * The one definition of the jobs query's identity. The server's prefetch and the client's read
 * both import it, so they cannot drift. Free of server-only and client-only imports on purpose.
 */
export const jobsCache = {
  key: ["jobs"] as const,

  /**
   * `staleTime` must be greater than zero: with the default of 0 the client would refetch the
   * moment it mounted and throw away everything the server just prefetched and streamed down.
   * A minute is long enough to cover hydration and short enough that a tab left open overnight
   * refreshes on the next focus. The user's own mutations update the cache directly, so the
   * board never waits on this to show a change.
   */
  staleTime: 60_000,

  options: (fetchJobs: () => Promise<Job[]>) =>
    queryOptions({
      queryKey: jobsCache.key,
      queryFn: fetchJobs,
      staleTime: jobsCache.staleTime,
    }),
};

/** The cached list with one Job swapped for the server's copy of it. */
export function replaceJob(jobs: Job[] | undefined, job: Job): Job[] | undefined {
  return jobs?.map((candidate) => (candidate.id === job.id ? job : candidate));
}
