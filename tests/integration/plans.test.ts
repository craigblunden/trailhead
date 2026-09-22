import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { PLAN_LIMITS, UPGRADE_REQUEST_LAPSES_AFTER_DAYS, type Plan } from "@/lib/plans";
import { currentPlan, limits, pendingUpgradeRequest, requestUpgrade } from "@/server/data/plans";
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

describe("upgrade-requests tickets 01–02: asking to be moved up a Plan (ADR-0009)", () => {
  /** The Resend call, stubbed: nothing here sends real mail. Returns the bodies it was given. */
  function captureMail() {
    const sent: { subject: string; text: string; to: string }[] = [];
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("OWNER_TO_EMAIL", "owner@example.com");
    vi.stubEnv("OWNER_FROM_EMAIL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { subject: string; text: string; to: string[] };
        sent.push({ subject: body.subject, text: body.text, to: body.to[0]! });
        return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
      }),
    );
    return sent;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const pendingFor = (userId: string, plan: Plan) =>
    withTenant(userId, (_tx, tenant) => pendingUpgradeRequest(tenant, plan));

  it("REQ-7: a free Tenant asks for basic; the row is kept and the owner gets the command to run", async () => {
    const sent = captureMail();
    const userId = newUserId();
    signInAs(userId, "sam@example.com");

    const request = await requestUpgrade();

    expect(request.plan).toBe("basic");
    expect(await pendingFor(userId, "free")).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.subject).toBe("Trailhead upgrade request: basic for Tester");
    expect(sent[0]!.text).toContain("npm run db:plan -- sam@example.com basic");
    expect(sent[0]!.text).toContain("Asked for the first time");
  });

  it("REQ-8: asking again while one is outstanding is refused, and sends nothing", async () => {
    const sent = captureMail();
    const userId = newUserId();
    signInAs(userId);
    await requestUpgrade();

    await expect(requestUpgrade()).rejects.toThrow(/already asked/i);
    expect(sent).toHaveLength(1);
    expect(await withTenant(userId, (tx) => tx.upgradeRequest.count())).toBe(1);
  });

  it("REQ-9: granting the Plan resolves it — no status flipped — and they may then ask for pro", async () => {
    const sent = captureMail();
    const userId = newUserId();
    signInAs(userId);
    await requestUpgrade();

    // The owner's one act, exactly as `npm run db:plan` performs it.
    await setPlan(userId, "basic");

    expect(await pendingFor(userId, "basic")).toBeNull();
    const second = await requestUpgrade();
    expect(second.plan).toBe("pro");
    // The history is what tells the owner this is not a first ask.
    expect(sent[1]!.text).toContain("Asked 2 times since");
  });

  it("REQ-10: a Tenant on the top Plan has nothing to ask for", async () => {
    captureMail();
    const userId = newUserId();
    await setPlan(userId, "pro");
    signInAs(userId);

    await expect(requestUpgrade()).rejects.toThrow(/highest plan/i);
  });

  it("REQ-11: the app role may insert a request and never edit or withdraw one", async () => {
    captureMail();
    const userId = newUserId();
    signInAs(userId);
    await requestUpgrade();
    const row = await withTenant(userId, (tx) => tx.upgradeRequest.findFirstOrThrow());

    await expect(
      withTenant(userId, (tx) => tx.upgradeRequest.update({ where: { id: row.id }, data: { plan: "pro" } })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(userId, (tx) => tx.upgradeRequest.delete({ where: { id: row.id } })),
    ).rejects.toThrow(/permission denied/);
  });

  it("REQ-12: a request that has lapsed is not pending, and asking again is allowed", async () => {
    captureMail();
    const userId = newUserId();
    signInAs(userId);
    const longAgo = new Date(Date.now() - (UPGRADE_REQUEST_LAPSES_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000);
    await requestUpgrade(longAgo);

    expect(await pendingFor(userId, "free")).toBeNull();
    await expect(requestUpgrade()).resolves.toMatchObject({ plan: "basic" });
    expect(await withTenant(userId, (tx) => tx.upgradeRequest.count())).toBe(2);
  });

  it("REQ-13: when the email cannot be sent, no row is written — the ask is never silently lost", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("OWNER_TO_EMAIL", "owner@example.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const userId = newUserId();
    signInAs(userId);

    await expect(requestUpgrade()).rejects.toThrow(/Resend refused/);
    expect(await withTenant(userId, (tx) => tx.upgradeRequest.count())).toBe(0);
  });
});
