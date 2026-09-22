import { queryOptions } from "@tanstack/react-query";

import type { FootingPanel } from "@/lib/footing";

/**
 * The one definition of a Job's Footing query. The job page's prefetch and the two components that
 * read it — the card beside the Application kit, and the Letter dimension beside the letter — all
 * import this, so they cannot drift and they share one fetch.
 *
 * Keyed by Job, and deliberately separate from the jobs list: nothing about a Footing goes near the
 * board's list query, its provider, or its cache, because the board's responsiveness rests on them.
 */
export const footingCache = {
  key: (jobId: string) => ["footing", jobId] as const,

  /** Long enough to cover hydration; a scoring writes its result straight into the cache anyway. */
  staleTime: 60_000,

  options: (jobId: string, fetchPanel: (jobId: string) => Promise<FootingPanel>) =>
    queryOptions({
      queryKey: footingCache.key(jobId),
      queryFn: () => fetchPanel(jobId),
      staleTime: footingCache.staleTime,
    }),
};
