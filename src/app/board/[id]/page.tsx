import { HydrationBoundary } from "@tanstack/react-query";

import { JobDetail } from "@/components/job/job-detail";
import { listJobs } from "@/server/data/jobs";
import { prefetchJobs } from "@/server/prefetch";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <HydrationBoundary state={prefetchJobs(listJobs)}>
      <JobDetail jobId={id} />
    </HydrationBoundary>
  );
}
