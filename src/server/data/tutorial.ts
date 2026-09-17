import "server-only";

import { requireSession } from "@/server/auth/session";
import { withTenant } from "@/server/db/tenant";

/**
 * Whether the Tenant has finished a run of the Interview Simulator of any kind — a Practice round or an
 * Attempt, answered to the end or run out of time (practice feedback ticket 06). Until they have, the
 * Tutorial is offered. Unfinished runs don't count: starting one is not the same as knowing how it goes.
 */
export async function hasFinishedARun(): Promise<boolean> {
  const { userId } = await requireSession();
  return withTenant(userId, async (tx) => {
    const round = await tx.practiceRound.findFirst({ where: { userId, completedAt: { not: null } }, select: { id: true } });
    if (round) return true;
    const attempt = await tx.attempt.findFirst({ where: { userId, completedAt: { not: null } }, select: { id: true } });
    return attempt !== null;
  });
}
