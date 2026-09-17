import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { InterviewPanel } from "@/components/interview/interview-panel";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { interviewQuota, pastAttempts } from "@/server/data/interview";
import { listJobs } from "@/server/data/jobs";
import { currentPlan } from "@/server/data/plans";
import { interviewAvailable } from "@/server/interview/claude";
import { prefetchJobs } from "@/server/prefetch";

export const metadata: Metadata = { title: "Interview Simulator" };

/**
 * The Interview Simulator with no job chosen: the path open on its first step, which job (interview
 * simulator ticket 07). Choosing one moves to `/interview/<job>`. Every Plan may open it — a Tenant
 * not on `pro` sees the same path with its set-up locked (ticket 08). Below the path, the Tenant's past
 * interviews (interview second pass ticket 06).
 */
export default async function InterviewPage() {
  // The page, not the layout, decides who may see it.
  await requirePageSession();
  const [state, plan, quota, history] = await Promise.all([
    prefetchJobs(listJobs),
    currentPlan(),
    interviewQuota().catch(() => null),
    // The list is extra: a failure to read it leaves the hub without it rather than without the page.
    pastAttempts().catch(() => []),
  ]);
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <InterviewPanel
          job={null}
          plan={plan}
          attempt={null}
          quota={quota}
          available={interviewAvailable()}
          history={history}
        />
      </HydrationBoundary>
    </PageArrive>
  );
}
