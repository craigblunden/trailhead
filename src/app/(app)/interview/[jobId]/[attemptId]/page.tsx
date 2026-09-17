import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PastScorecardPage } from "@/components/interview/past-interviews";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { scoredAttempt } from "@/server/data/interview";
import { getJob } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Interview Simulator" };

/**
 * One past interview's Scorecard, view-only, at a link the Tenant can come back to (interview second
 * pass ticket 06). Another Tenant's Attempt, an unknown one, an unscored one, and one that belongs to a
 * different Job are all the same not-found. `/interview/<job>` is unchanged: still that Job's latest
 * Attempt, for Resume or Go.
 */
export default async function PastInterviewPage({
  params,
}: {
  params: Promise<{ jobId: string; attemptId: string }>;
}) {
  await requirePageSession();
  const { jobId, attemptId } = await params;

  const [job, attempt] = await Promise.all([getJob(jobId), scoredAttempt(jobId, attemptId)]);
  if (!job || !attempt) notFound();

  return (
    <PageArrive>
      {/* Only what the page shows about the Job — not its notes, contacts, or Draft. */}
      <PastScorecardPage job={{ id: job.id, company: job.company, role: job.role }} attempt={attempt} />
    </PageArrive>
  );
}
