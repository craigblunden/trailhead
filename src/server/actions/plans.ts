"use server";

import type { Limits, UpgradeRequest } from "@/lib/plans";
import { runAction, type ActionResult } from "@/server/action-result";
import { limits, requestUpgrade } from "@/server/data/plans";

/** The signed-in Tenant's Limits, for the sites that show one before it is reached. Reads only. */
export async function limitsAction(): Promise<ActionResult<Limits>> {
  return runAction("plans.limits", () => limits());
}

/**
 * Asks to be moved to the next Plan up (CONTEXT.md; ADR-0009). A public POST endpoint, so it reads
 * **nothing** from what it was sent: there is no Plan the client is allowed to name, and the data
 * layer derives the target from the Tenant's own Plan, inside the transaction that reads it.
 */
export async function requestUpgradeAction(): Promise<ActionResult<UpgradeRequest>> {
  return runAction("plans.requestUpgrade", () => requestUpgrade());
}
