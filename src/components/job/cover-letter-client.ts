import { unwrapping } from "@/components/action-client";
import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import type { GenerationRequest, GenerationResponse } from "@/lib/generation";
import { generationStatusAction } from "@/server/actions/generation";

/**
 * How the cover-letter card reaches the server. Generation is a plain POST to the Route Handler —
 * deliberately not a Server Action, so it never queues the page's other edits behind it. With
 * Feedback it carries a JSON body and is a Rewrite; without, no body, and a fresh write. The
 * status read is an ordinary action. Component tests replace this module.
 */
export const coverLetterClient = {
  status: unwrapping(generationStatusAction),

  generate: async (jobId: string, feedback = ""): Promise<GenerationResponse> => {
    let response: Response;
    try {
      const body: GenerationRequest = { feedback };
      response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter`, {
        method: "POST",
        ...(feedback
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
    } catch {
      return {
        ok: false,
        error: "failed",
        message:
          "We couldn’t reach the server, so we can’t tell whether that letter was counted. Check your connection and try again.",
      };
    }
    const body = (await response.json().catch(() => null)) as GenerationResponse | null;
    if (!body) {
      return { ok: false, error: "failed", message: "Something went wrong on our side. Try again in a minute." };
    }
    if (!body.ok && body.error === "unauthenticated") window.location.assign(SESSION_ENDED_PATH);
    return body;
  },
};
