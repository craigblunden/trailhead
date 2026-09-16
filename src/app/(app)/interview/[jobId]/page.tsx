import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InterviewPanel } from "@/components/interview/interview-panel";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { NotFoundError } from "@/server/data/errors";
import { interviewQuota, latestAttempt } from "@/server/data/interview";
import { getJob } from "@/server/data/jobs";
import { interviewAvailable } from "@/server/interview/claude";
import { currentPlan } from "@/server/data/plans";

export const metadata: Metadata = { title: "Interview Simulator" };

/**
 * One Job's Interview Simulator. The Attempt is read on the server and handed down, so a Tenant who
 * closed the tab mid-rehearsal lands back on the question they were up to, with the time they had
 * left — rather than on a start screen that would quietly cost them another Attempt (ticket 04).
 */
export default async function JobInterviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requirePageSession();
  const { jobId } = await params;

  const job = await getJob(jobId);
  if (!job) notFound();

  // A Tenant with no Attempt for this Job has nothing to read back; that is the start screen, not a
  // failure. The quota is read alongside it so the screen can say what this week leaves.
  const [plan, attempt, quota] = await Promise.all([
    currentPlan(),
    latestAttempt(jobId).catch((error) => {
      if (error instanceof NotFoundError) throw error;
      return null;
    }),
    interviewQuota().catch(() => null),
  ]);

  return (
    <PageArrive>
      <InterviewPanel
        job={{ id: job.id, company: job.company, role: job.role }}
        plan={plan}
        attempt={attempt}
        quota={quota}
        available={interviewAvailable()}
      />
    </PageArrive>
  );
}
