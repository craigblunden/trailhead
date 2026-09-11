import { unwrap } from "@/components/action-client";
import type { JobsClient } from "@/lib/jobs-client";
import {
  createJobAction,
  listJobsAction,
  setJobStageAction,
  updateJobAction,
} from "@/server/actions/jobs";

/** The board's client over Server Actions — the only write path from the browser. */
export function createActionsJobsClient(): JobsClient {
  return {
    list: async () => unwrap(await listJobsAction()),
    add: async (input) => unwrap(await createJobAction(input)),
    update: async (id, patch) => unwrap(await updateJobAction(id, patch)),
    setStage: async (id, stage) => unwrap(await setJobStageAction(id, stage)),
  };
}
