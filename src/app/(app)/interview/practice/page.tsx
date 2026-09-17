import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PracticePanel } from "@/components/interview/practice-panel";
import { PageArrive } from "@/components/page-transition";
import { canStartPracticeRound } from "@/lib/practice";
import { requirePageSession } from "@/server/auth/session";
import { currentPlan } from "@/server/data/plans";
import { unfinishedPracticeRound } from "@/server/data/practice";
import { hasFinishedARun } from "@/server/data/tutorial";

export const metadata: Metadata = { title: "Practice round" };

/**
 * A Practice round (practice round ticket 03): the set-up and Go, or the round left unfinished, read on
 * the server and handed down so a Tenant who closed the tab lands back on Resume with the time they had
 * left. A Plan with the full Simulator has no round to take, so it goes to the Simulator itself.
 *
 * A static segment, so it is matched before `/interview/<job>` ever reads "practice" as a Job.
 */
export default async function PracticeRoundPage() {
  await requirePageSession();
  const plan = await currentPlan();
  if (!canStartPracticeRound(plan)) redirect("/interview");

  const [round, finishedARun] = await Promise.all([
    unfinishedPracticeRound(),
    // Whether to offer the Tutorial above Go (practice feedback ticket 06); failing to read it offers nothing.
    hasFinishedARun().catch(() => true),
  ]);
  return (
    <PageArrive>
      <PracticePanel round={round} newToSimulator={!finishedARun} />
    </PageArrive>
  );
}
