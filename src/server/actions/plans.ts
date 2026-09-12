"use server";

import type { Limits } from "@/lib/plans";
import { runAction, type ActionResult } from "@/server/action-result";
import { limits } from "@/server/data/plans";

/** The signed-in Tenant's Limits, for the sites that show one before it is reached. Reads only. */
export async function limitsAction(): Promise<ActionResult<Limits>> {
  return runAction("plans.limits", () => limits());
}
