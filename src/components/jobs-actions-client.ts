import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import type { JobsClient } from "@/lib/jobs-client";
import {
  createJobAction,
  listJobsAction,
  setJobStageAction,
  updateJobAction,
  type ActionFailure,
  type ActionResult,
} from "@/server/actions/jobs";

/** An action said no. `message` is safe to show; `kind` says what to do about it. */
export class ActionError extends Error {
  constructor(
    readonly kind: ActionFailure["error"],
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  if (result.error === "unauthenticated" && typeof window !== "undefined") {
    // The session ended under us. Nothing on this page can succeed now; go and get a new one.
    window.location.assign(SESSION_ENDED_PATH);
  }
  throw new ActionError(result.error, result.message);
}

/** The board's client over Server Actions — the only write path from the browser. */
export function createActionsJobsClient(): JobsClient {
  return {
    list: async () => unwrap(await listJobsAction()),
    add: async (input) => unwrap(await createJobAction(input)),
    update: async (id, patch) => unwrap(await updateJobAction(id, patch)),
    setStage: async (id, stage) => unwrap(await setJobStageAction(id, stage)),
  };
}
