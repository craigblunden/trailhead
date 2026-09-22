import { HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { JobDetail } from "@/components/job/job-detail";
import { SummitScenes } from "@/components/job/summit-scenes";
import { PageArrive } from "@/components/page-transition";
import { footingCache } from "@/lib/footing-cache";
import { jobsCache } from "@/lib/jobs-cache";
import { requirePageSession } from "@/server/auth/session";
import { listJobs } from "@/server/data/jobs";
import { footingPanel } from "@/server/footing/panel";
import { prefetch } from "@/server/prefetch";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession();
  const { id } = await params;
  // The jobs list, as every page under `(app)` prefetches it, plus this one Job's Footing — its own
  // query, keyed by Job (footing ticket 04). Nothing about a Footing goes into the list query, whose
  // shape the board's responsiveness rests on.
  //
  // In this order, and NOT concurrently. They are two reads in two transactions, so a write landing
  // between them would be visible to one and not the other; read this way round, a page whose
  // description is the new one cannot also carry a Footing that thinks it is still current.
  const state = await prefetch(async (queryClient: QueryClient) => {
    await queryClient.prefetchQuery(jobsCache.options(listJobs));
    // An id the page was opened at may be an optimistic one for a Job still saving, or simply not
    // this Tenant's; a prefetch that cannot find it dehydrates nothing, and the client fetches for
    // itself once the real id lands.
    await queryClient.prefetchQuery(footingCache.options(id, footingPanel));
  });
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        {/* The header's pictures are drawn here, on the server, and handed in (see `JobDetail`). */}
        <JobDetail jobId={id} scenes={<SummitScenes />} />
      </HydrationBoundary>
    </PageArrive>
  );
}
