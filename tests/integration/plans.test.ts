import { beforeEach, describe, expect, it } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { PLAN_LIMITS } from "@/lib/plans";
import { currentPlan, limits } from "@/server/data/plans";
import { prisma } from "@/server/db/prisma";
import { withTenant } from "@/server/db/tenant";

import { newUserId, resetTables, setPlan } from "./helpers";

/**
 * A Tenant's Plan is a row the app role reads and never writes (ADR-0001, plans issue 02). The
 * boundary is a missing grant, not a convention, so the test proves the grant.
 */

beforeEach(async () => {
  await resetTables();
  signOut();
});

describe("plans issue 02: the UserPlan table and the Limits read", () => {
  it("PLAN-3: a Tenant with no row is on free, with free's Limits", async () => {
    signInAs(newUserId());
    expect(await currentPlan()).toBe("free");
    expect(await limits()).toEqual(PLAN_LIMITS.free);
  });

  it("PLAN-4: a row written as the migrator puts the Tenant on pro, with pro's Limits", async () => {
    const userId = newUserId();
    await setPlan(userId, "pro");
    signInAs(userId);
    expect(await currentPlan()).toBe("pro");
    expect(await limits()).toEqual(PLAN_LIMITS.pro);
  });

  it("PLAN-5: setting free again removes the row, and another Tenant never sees the first's", async () => {
    const userA = newUserId();
    const userB = newUserId();
    await setPlan(userA, "pro");

    signInAs(userB);
    expect(await currentPlan()).toBe("free");
    expect(await withTenant(userB, (tx) => tx.userPlan.count())).toBe(0);

    await setPlan(userA, "free");
    signInAs(userA);
    expect(await currentPlan()).toBe("free");
    expect(await prisma.$queryRaw<{ n: number }[]>`select count(*)::int as n from "UserPlan"`).toEqual([{ n: 0 }]);
  });

  it("PLAN-6: the app role cannot insert, update, or delete a Plan — even its own", async () => {
    const userId = newUserId();
    await expect(
      withTenant(userId, (tx) => tx.userPlan.create({ data: { userId, plan: "pro" } })),
    ).rejects.toThrow(/permission denied/);

    await setPlan(userId, "pro");
    await expect(
      withTenant(userId, (tx) => tx.userPlan.update({ where: { userId }, data: { plan: "free" } })),
    ).rejects.toThrow(/permission denied/);
    await expect(withTenant(userId, (tx) => tx.userPlan.delete({ where: { userId } }))).rejects.toThrow(
      /permission denied/,
    );

    signInAs(userId);
    expect(await currentPlan()).toBe("pro");
  });

  it("PLAN-7: without a session the read throws, and nothing is guessed", async () => {
    await expect(currentPlan()).rejects.toThrow(/sign in/i);
  });
});
