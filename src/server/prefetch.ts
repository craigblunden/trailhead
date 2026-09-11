import "server-only";

import { QueryClient, defaultShouldDehydrateQuery, dehydrate } from "@tanstack/react-query";

import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";

/**
 * A per-request QueryClient with the jobs list prefetched but NOT awaited: the promise itself is
 * dehydrated, so the server streams the page shell while the query resolves and the client picks
 * the result up on hydration. Pending queries are not dehydrated by default, hence the override.
 */
export function prefetchJobs(fetchJobs: () => Promise<Job[]>) {
  const queryClient = new QueryClient();
  void queryClient.prefetchQuery(jobsCache.options(fetchJobs));
  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) || query.state.status === "pending",
  });
}
