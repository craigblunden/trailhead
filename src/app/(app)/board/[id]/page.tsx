import { HydrationBoundary } from "@tanstack/react-query";

import { JobDetail } from "@/components/job/job-detail";
import { SummitScenes } from "@/components/job/summit-scenes";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { listJobs } from "@/server/data/jobs";
import { prefetchJobs } from "@/server/prefetch";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession();
  const { id } = await params;
  return (
    <PageArrive>
      <HydrationBoundary state={await prefetchJobs(listJobs)}>
        {/* The header's pictures are drawn here, on the server, and handed in (see `JobDetail`). */}
        <JobDetail jobId={id} scenes={<SummitScenes />} />
      </HydrationBoundary>
    </PageArrive>
  );
}
