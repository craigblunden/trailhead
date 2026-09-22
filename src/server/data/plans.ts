import "server-only";

import { cache } from "react";

import {
  ALREADY_REQUESTED,
  DEFAULT_PLAN,
  TOP_PLAN,
  isUpgradeRequestPending,
  limitsOf,
  nextPlanUp,
  type Limits,
  type Plan,
  type UpgradeRequest,
} from "@/lib/plans";
import { requireSession } from "@/server/auth/session";
import { RuleError } from "@/server/data/errors";
import { withTenant, type Tenant } from "@/server/db/tenant";
import { logEvent } from "@/server/log";
import { sendUpgradeRequest } from "@/server/mail/upgrade-request";

/**
 * The data access layer for Plans (plans issue 02, ADR-0001) and Upgrade requests (ADR-0009).
 *
 * A Plan is read-only by construction: the app role has no grant to write `UserPlan`, so there is no
 * function here that could, and no row means the default Plan. `requestUpgrade` below is the one
 * write in this module, and what it writes is a request to be moved — never the move itself.
 */

/** The Tenant's Plan, from inside a tenant transaction — for the sites that enforce a Limit. */
export async function planOf(tenant: Tenant): Promise<Plan> {
  const row = await tenant.tx.userPlan.findUnique({
    where: { userId: tenant.userId },
    select: { plan: true },
  });
  return row?.plan ?? DEFAULT_PLAN;
}

/**
 * The signed-in Tenant's Plan, for display. Memoised per render pass with React's `cache`, like the
 * session, so a layout and its page read it once between them. A site that enforces a Limit reads
 * `planOf` inside the transaction that counts against it instead.
 */
export const currentPlan = cache(async (): Promise<Plan> => {
  const { userId } = await requireSession();
  return withTenant(userId, (_tx, tenant) => planOf(tenant));
});

/** The Tenant's Limits, by way of its Plan. */
export async function limits(): Promise<Limits> {
  return limitsOf(await currentPlan());
}

/**
 * Upgrade requests (CONTEXT.md; ADR-0009). The one thing in this module that writes — and what it
 * writes is a request, never a Plan. `UserPlan` stays as ADR-0001 left it: readable, never writable.
 */

/** The Tenant's newest Upgrade request, pending or not. Nothing older matters: a later ask supersedes. */
async function newestRequest(tenant: Tenant): Promise<UpgradeRequest | null> {
  const row = await tenant.tx.upgradeRequest.findFirst({
    where: { userId: tenant.userId },
    orderBy: { requestedAt: "desc" },
    select: { plan: true, requestedAt: true },
  });
  return row;
}

/**
 * The Tenant's Upgrade request if one is still outstanding, and null otherwise — a request that has
 * been granted or has lapsed is nothing the account page should show. Filtered here rather than in the
 * browser, so the client never holds a request it is meant to ignore.
 */
export async function pendingUpgradeRequest(
  tenant: Tenant,
  plan: Plan,
  now: Date = new Date(),
): Promise<UpgradeRequest | null> {
  const request = await newestRequest(tenant);
  return request && isUpgradeRequestPending(request, plan, now) ? request : null;
}

/**
 * Records that the signed-in Tenant would like the next Plan up, and tells the owner.
 *
 * **Takes no arguments on purpose.** The Plan asked for is derived from the Tenant's own Plan, read
 * inside the transaction — a client that could name a Plan could name `pro`.
 *
 * The email goes first, and the row second. They cannot be atomic: `withTenant` holds a pooled
 * connection, so the call out happens between two transactions either way. Sending first means a
 * failed send leaves no row and throws, and the Tenant can try again; the other order fails silently,
 * with the button disabled and the owner never told.
 */
export async function requestUpgrade(now: Date = new Date()): Promise<UpgradeRequest> {
  const session = await requireSession();

  const { plan, pending, asked, since } = await withTenant(session.userId, async (tx, tenant) => {
    const current = await planOf(tenant);
    const [history, first] = await Promise.all([
      tx.upgradeRequest.count({ where: { userId: tenant.userId } }),
      tx.upgradeRequest.findFirst({
        where: { userId: tenant.userId },
        orderBy: { requestedAt: "asc" },
        select: { requestedAt: true },
      }),
    ]);
    return {
      plan: current,
      pending: await pendingUpgradeRequest(tenant, current, now),
      asked: history,
      since: first?.requestedAt ?? null,
    };
  });

  const wanted = nextPlanUp(plan);
  if (!wanted) throw new RuleError("top-plan", TOP_PLAN);
  if (pending) throw new RuleError("already-requested", ALREADY_REQUESTED);

  await sendUpgradeRequest(session, {
    current: plan,
    wanted,
    asked: asked + 1,
    since: since ?? now,
  });

  const created = await withTenant(session.userId, (tx) =>
    tx.upgradeRequest.create({
      data: { userId: session.userId, plan: wanted, requestedAt: now },
      select: { plan: true, requestedAt: true },
    }),
  );

  logEvent({ operation: "plan.requestUpgrade", tenant: session.userId, plan: wanted });
  return created;
}
