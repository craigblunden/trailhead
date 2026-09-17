import type { RunQuestion, TimedRun } from "@/lib/interview";
import type { Plan } from "@/lib/plans";
import { canStartPracticeRound } from "@/lib/practice";

/**
 * The **Tutorial** (`CONTEXT.md`, practice feedback ticket 06): one guided question that shows a Tenant how
 * any run of the Interview Simulator works before their first. It is kept nowhere and counted by nothing,
 * so everything it is lives here, in the page.
 */

/** Easy to answer without a real job in mind, and nothing like the questions of a real run. */
export const TUTORIAL_QUESTION = "Tell me about a job you’d love to land next.";

/** Short enough to see the countdown move meaningfully; it is not a rehearsal of a real answer. */
export const TUTORIAL_SECONDS = 60;

/** The Tutorial as a timed run, for the real run screen. The same object every time, so nothing re-renders for it. */
export const TUTORIAL_RUN: TimedRun<RunQuestion> = {
  id: "tutorial",
  countdownSeconds: TUTORIAL_SECONDS,
  activeSeconds: 0,
  questions: [{ id: "tutorial-question", category: "personal", order: 0, text: TUTORIAL_QUESTION }],
};

/**
 * Where a device remembers the Tutorial was finished or skipped. Per device on purpose: a new phone means
 * a new microphone permission anyway, and a Tenant who has finished a run is not offered it at all.
 */
export const TUTORIAL_SEEN_KEY = "trailhead:tutorial-seen";

/** Where the Tutorial leads once it is done: the run this Plan can take. */
export function afterTutorial(plan: Plan): { href: string; label: string } {
  return canStartPracticeRound(plan)
    ? { href: "/interview/practice", label: "Start a practice round" }
    : { href: "/interview", label: "Choose a job" };
}
