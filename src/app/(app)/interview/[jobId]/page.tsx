import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InterviewPanel } from "@/components/interview/interview-panel";
import { readinessOf } from "@/lib/interview";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { interviewQuota, latestAttempt } from "@/server/data/interview";
import { getJob } from "@/server/data/jobs";
import { interviewAvailable } from "@/server/interview/claude";
import { currentPlan } from "@/server/data/plans";
import { hasFinishedARun } from "@/server/data/tutorial";

export const metadata: Metadata = { title: "Interview Simulator" };

/**
 * The Interview Simulator with a job chosen: the path with its first step done (interview simulator
 * ticket 07 — a Job page's own link lands here, skipping the picker). The Attempt is read on the
 * server and handed down, so a Tenant who closed the tab mid-rehearsal lands back on Resume with the
 * time they had left, rather than on a set-up that would quietly cost them another Attempt (ticket 04).
 */
export default async function JobInterviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requirePageSession();
  const { jobId } = await params;

  const job = await getJob(jobId);
  if (!job) notFound();

  // A Tenant with no Attempt for this Job has nothing to read back; that is the set-up, not a failure.
  // The quota is read alongside it so the path can say what this week leaves.
  const [plan, attempt, quota, finishedARun] = await Promise.all([
    currentPlan(),
    latestAttempt(jobId).catch((error) => {
      if (error instanceof NotFoundError) throw error;
      return null;
    }),
    interviewQuota().catch(() => null),
    // Whether to offer the Tutorial (practice feedback ticket 06); failing to read it offers nothing.
    hasFinishedARun().catch(() => true),
  ]);

  return (
    <PageArrive>
      <InterviewPanel
        // Only what the path shows, and whether the job can be rehearsed — not the Job's notes, contacts,
        // or Draft, which have no business in the browser on this page.
        job={{
          id: job.id,
          company: job.company,
          role: job.role,
          accent: job.accent,
          stage: job.stage,
          readiness: readinessOf(job),
        }}
        plan={plan}
        attempt={attempt}
        quota={quota}
        available={interviewAvailable()}
        newToSimulator={!finishedARun}
      />
    </PageArrive>
  );
}
