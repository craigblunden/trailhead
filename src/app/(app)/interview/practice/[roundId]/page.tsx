import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SavedPracticeRound } from "@/components/interview/practice-rounds";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { currentPlan } from "@/server/data/plans";
import { finishedPracticeRound } from "@/server/data/practice";

export const metadata: Metadata = { title: "Practice round" };

/**
 * One saved Practice round, read back view-only at a link the Tenant can come back to (practice round
 * ticket 05). Another Tenant's round, an unknown one, and one still unfinished are all the same
 * not-found — the unfinished one is resumed at `/interview/practice`, not read back here.
 */
export default async function SavedPracticeRoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  await requirePageSession();
  const { roundId } = await params;

  const [plan, round] = await Promise.all([currentPlan(), finishedPracticeRound(roundId)]);
  if (!round) notFound();

  return (
    <PageArrive>
      <SavedPracticeRound round={round} plan={plan} />
    </PageArrive>
  );
}
