import "server-only";

import type { FootingPanel } from "@/lib/footing";
import { footingHistory } from "@/server/data/footing";

import { footingAvailable } from "./typesafe";

/**
 * What the job page is told about one Job's Footing (footing tickets 04, 05): its readings, and
 * whether the feature is configured on this deployment at all.
 *
 * Its own module because it has two callers that must not reach each other: the page prefetches it
 * on the server, straight from the data layer, and `footingPanelAction` serves the browser's own
 * fetch of the same thing. A page calling that action instead would be a Server Component going in
 * through the browser's public POST endpoint, which is not a layer a page is allowed to stand on
 * (`docs/architecture.md` — a page reads the data layer).
 *
 * Availability travels with the readings rather than in a second call: the page needs both to choose
 * between the control, the disabled control, and no control at all.
 */
export async function footingPanel(jobId: string): Promise<FootingPanel> {
  return { available: footingAvailable(), ...(await footingHistory(jobId)) };
}
