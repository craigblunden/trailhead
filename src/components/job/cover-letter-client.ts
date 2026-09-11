import { unwrap } from "@/components/jobs-actions-client";
import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import type { GenerationResponse } from "@/lib/generation";
import { generationStatusAction, type GenerationStatus } from "@/server/actions/generation";

/**
 * How the cover-letter card reaches the server. Generation is a plain POST to the Route Handler —
 * deliberately not a Server Action, so it never queues the page's other edits behind it. The
 * status read is an ordinary action. Component tests replace this module.
 */
export const coverLetterClient = {
  status: async (): Promise<GenerationStatus> => unwrap(await generationStatusAction()),

  generate: async (jobId: string): Promise<GenerationResponse> => {
    let response: Response;
    try {
      response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter`, { method: "POST" });
    } catch {
      return {
        ok: false,
        error: "failed",
        message: "We couldn’t reach the server. Check your connection and try again.",
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
