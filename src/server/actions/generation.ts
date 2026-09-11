"use server";

import type { QuotaStatus } from "@/lib/generation";
import { runAction, type ActionResult } from "@/server/action-result";
import { generationQuota } from "@/server/data/generation";
import { generationAvailable } from "@/server/generation/cover-letter";

export type GenerationStatus = QuotaStatus & {
  /** False when this deployment has no Anthropic key: the card says so instead of offering a button. */
  available: boolean;
};

/** Letters left this week, for the card to show before the user presses anything. Reads only. */
export async function generationStatusAction(): Promise<ActionResult<GenerationStatus>> {
  return runAction("generation.status", async () => ({
    ...(await generationQuota()),
    available: generationAvailable(),
  }));
}
