import type { Stage } from "@/lib/jobs";

type SummitPhase = {
  /** The Stage's name on the climb's progress strip. */
  step: string;
  /** What the hiker is doing at this Stage, as the strip's lead-in. */
  phase: string;
  line: string;
  /** The colour at the top of the Stage's scene, which the header continues above the picture. */
  sky: string;
};

/**
 * A Job's page tells its Stage as a summit attempt: studying the map, base camp, the climb, the
 * summit, and, off the route, regrouping at camp for the next attempt. The words here go with the
 * pictures in `SummitScenes`, and the Stage's own name is always said beside them.
 */
export const SUMMIT: Record<Stage, SummitPhase> = {
  interested: {
    step: "Map",
    phase: "Studying the map",
    line: "Scout the route before you commit. Is this peak worth the climb?",
    sky: "#d8e8f1",
  },
  applied: {
    step: "Base camp",
    phase: "Base camp",
    line: "Your application is in. Check your kit and wait for a weather window.",
    sky: "#d3e3ee",
  },
  interviewing: {
    step: "Climb",
    phase: "On the climb",
    line: "Roped in and moving up. Keep notes on every pitch.",
    sky: "#bcd4e9",
  },
  offer: {
    step: "Summit",
    phase: "Summit",
    line: "Above the clouds. Take in the view, then decide how you come down.",
    sky: "#b3d1ea",
  },
  rejected: {
    step: "Regroup",
    phase: "Regroup at camp",
    line: "Not this peak, not this season. What you learned is gear for the next attempt.",
    sky: "#d9c2d4",
  },
};
