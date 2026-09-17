import type { Metadata } from "next";

import { TutorialPanel } from "@/components/interview/tutorial-panel";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { currentPlan } from "@/server/data/plans";

export const metadata: Metadata = { title: "Tutorial" };

/**
 * The Tutorial (practice feedback ticket 06): one guided question, open to every Plan. Nothing about it is
 * stored, so the only thing read is the Plan, which decides where it leads once done.
 *
 * A static segment, so it is matched before `/interview/<job>` ever reads "tutorial" as a Job.
 */
export default async function TutorialPage() {
  await requirePageSession();
  const plan = await currentPlan();
  return (
    <PageArrive>
      <TutorialPanel plan={plan} />
    </PageArrive>
  );
}
