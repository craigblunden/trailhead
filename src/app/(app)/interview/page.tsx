import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { InterviewHub } from "@/components/interview/interview-hub";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { listJobs } from "@/server/data/jobs";
import { currentPlan } from "@/server/data/plans";
import { prefetchJobs } from "@/server/prefetch";

export const metadata: Metadata = { title: "Interview Simulator" };

/**
 * The Interview Simulator's hub: which Job to rehearse for. Every Plan may open it — a Tenant not on
 * `pro` follows the same links to the same start screen, locked (interview simulator ticket 08).
 */
export default async function InterviewPage() {
  // The page, not the layout, decides who may see it.
  await requirePageSession();
  const [state, plan] = await Promise.all([prefetchJobs(listJobs), currentPlan()]);
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <InterviewHub plan={plan} />
      </HydrationBoundary>
    </PageArrive>
  );
}
