import { unwrapping } from "@/components/action-client";
import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import { FOOTING_FAILURES, type FootingResponse } from "@/lib/footing";
import { footingPanelAction } from "@/server/actions/footing";

/**
 * How the job page reaches a Footing. Reading is an ordinary Server Action; scoring is a plain POST
 * to the Route Handler — deliberately not an action, so a scoring never queues the page's other
 * edits behind it while the provider thinks. Component tests replace this module.
 */
export const footingClient = {
  panel: unwrapping(footingPanelAction),

  score: async (jobId: string): Promise<FootingResponse> => {
    let response: Response;
    try {
      response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/footing`, { method: "POST" });
    } catch {
      return {
        ok: false,
        error: "failed",
        message: "We couldn’t reach the server. Check your connection and try again.",
      };
    }
    const body = (await response.json().catch(() => null)) as FootingResponse | null;
    if (!body) return { ok: false, error: "failed", message: FOOTING_FAILURES.failed };
    if (!body.ok && body.error === "unauthenticated") window.location.assign(SESSION_ENDED_PATH);
    return body;
  },
};
