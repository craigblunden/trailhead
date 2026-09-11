import "server-only";

import { QueryClient, dehydrate } from "@tanstack/react-query";

import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";

/**
 * A per-request QueryClient with the jobs list prefetched, dehydrated for the client to hydrate
 * under the same key.
 *
 * The prefetch is AWAITED, deliberately. Dehydrating the pending promise instead would let the
 * shell stream sooner, but a hydrated promise gets its `dataUpdatedAt` when it resolves in the
 * browser — later than anything the client cache holds. Navigating while a mutation is still in
 * flight then reads the database before the write commits, and that stale snapshot overwrites
 * the confirmed state on arrival. Awaiting gives the snapshot the server's read time, so
 * hydration correctly yields to newer client state. One list query, one round trip: the trade is
 * worth it.
 */
export async function prefetchJobs(fetchJobs: () => Promise<Job[]>) {
  return prefetch((queryClient) => queryClient.prefetchQuery(jobsCache.options(fetchJobs)));
}

/**
 * A per-request QueryClient filled by `fill` and dehydrated. Awaited for the reason given above.
 * A failed prefetch dehydrates nothing, and the client fetches for itself.
 */
export async function prefetch(fill: (queryClient: QueryClient) => Promise<unknown>) {
  const queryClient = new QueryClient();
  await fill(queryClient);
  return dehydrate(queryClient);
}
