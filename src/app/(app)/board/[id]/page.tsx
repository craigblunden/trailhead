import { HydrationBoundary } from "@tanstack/react-query";

import { JobDetail } from "@/components/job/job-detail";
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
    <HydrationBoundary state={await prefetchJobs(listJobs)}>
      <JobDetail jobId={id} />
    </HydrationBoundary>
  );
}
