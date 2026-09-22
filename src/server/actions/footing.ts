"use server";

import type { FootingPanel } from "@/lib/footing";
import { parseId, runAction, type ActionResult } from "@/server/action-result";
import { footingPanel } from "@/server/footing/panel";

/**
 * Reading one Job's Footings (footing tickets 04, 05), for the browser. A plain read, so a Server
 * Action: it is the scoring that must not queue behind the page's other writes, and that is a Route
 * Handler.
 *
 * The page does not come through here — it calls `footingPanel()` directly, on the server.
 */
export async function footingPanelAction(jobId: unknown): Promise<ActionResult<FootingPanel>> {
  const job = parseId(jobId, "job");
  if (!job.ok) return job.failure;
  return runAction("footing.panel", () => footingPanel(job.id));
}
