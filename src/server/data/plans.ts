import "server-only";

import { DEFAULT_PLAN, limitsOf, type Limits, type Plan } from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import { withTenant, type Tenant } from "@/server/db/tenant";

/**
 * The data access layer for Plans (plans issue 02, ADR-0001). Read-only by construction: the app
 * role has no grant to write `UserPlan`, so there is no function here that could. No row means
 * the default Plan.
 */

/** The Tenant's Plan, from inside a tenant transaction — for the sites that enforce a Limit. */
export async function planOf(tenant: Tenant): Promise<Plan> {
  const row = await tenant.tx.userPlan.findUnique({
    where: { userId: tenant.userId },
    select: { plan: true },
  });
  return row?.plan ?? DEFAULT_PLAN;
}

export async function currentPlan(): Promise<Plan> {
  const { userId } = await requireSession();
  return withTenant(userId, (_tx, tenant) => planOf(tenant));
}

/** The Tenant's Limits, by way of its Plan. */
export async function limits(): Promise<Limits> {
  return limitsOf(await currentPlan());
}
