import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN,
  PLAN_LIMITS,
  PLANS,
  UPGRADE_REQUEST_LAPSES_AFTER_DAYS,
  isUpgradeRequestPending,
  limitsOf,
  nextPlanUp,
  withinLimit,
  type Plan,
  type UpgradeRequest,
} from "@/lib/plans";

describe("Plans and their Limits (plans issue 01)", () => {
  it("PLAN-1: free is the default and the numbers the app shipped with; basic sits between free and pro; pro holds any number of Documents and 25 letters a week", () => {
    expect(PLANS).toEqual(["free", "basic", "pro"]);
    expect(DEFAULT_PLAN).toBe("free");
    expect(PLAN_LIMITS.free).toEqual({ documents: 3, lettersPerWeek: 5, interviewsPerWeek: 1, interviewLengths: [15] });
    expect(PLAN_LIMITS.basic).toEqual({
      documents: 10,
      lettersPerWeek: 15,
      interviewsPerWeek: 3,
      interviewLengths: [15, 20],
    });
    expect(PLAN_LIMITS.pro).toEqual({
      documents: "unlimited",
      lettersPerWeek: 25,
      interviewsPerWeek: 10,
      interviewLengths: [15, 20, 30],
    });
    expect(limitsOf("pro")).toEqual(PLAN_LIMITS.pro);
  });

  it("PLAN-2: a count is within a Limit while below the number, and always within an unlimited one", () => {
    expect(withinLimit(2, 3)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
    expect(withinLimit(4, 3)).toBe(false);
    expect(withinLimit(0, "unlimited")).toBe(true);
    expect(withinLimit(1_000_000, "unlimited")).toBe(true);
  });
});

describe("Upgrade requests: the pending rule (upgrade-requests ticket 01, ADR-0009)", () => {
  const at = (iso: string) => new Date(iso);
  const asked = (plan: Plan, iso: string): UpgradeRequest => ({ plan, requestedAt: at(iso) });

  it("REQ-1: a request names the next Plan up, and the top Plan has nothing above it", () => {
    expect(nextPlanUp("free")).toBe("basic");
    expect(nextPlanUp("basic")).toBe("pro");
    expect(nextPlanUp("pro")).toBeNull();
  });

  it("REQ-2: a fresh request for a Plan the Tenant is not on is pending", () => {
    expect(isUpgradeRequestPending(asked("basic", "2026-09-20"), "free", at("2026-09-22"))).toBe(true);
  });

  it("REQ-3: granting the Plan resolves it, with no status to flip", () => {
    expect(isUpgradeRequestPending(asked("basic", "2026-09-20"), "basic", at("2026-09-22"))).toBe(false);
  });

  it("REQ-4: granting a HIGHER Plan than was asked for resolves it too", () => {
    expect(isUpgradeRequestPending(asked("basic", "2026-09-20"), "pro", at("2026-09-22"))).toBe(false);
  });

  it("REQ-5: an unanswered request lapses, so silence is a soft no rather than a dead end", () => {
    const request = asked("basic", "2026-09-01");
    // The last moment it still counts, and the first at which it does not.
    expect(isUpgradeRequestPending(request, "free", at("2026-09-14T23:59:59.999Z"))).toBe(true);
    expect(isUpgradeRequestPending(request, "free", at("2026-09-15T00:00:00.000Z"))).toBe(false);
    expect(UPGRADE_REQUEST_LAPSES_AFTER_DAYS).toBe(14);
  });

  it("REQ-6: moving a Tenant back down makes a request that has not lapsed pending again", () => {
    // Self-correcting rather than wrong: it lapses on its own schedule.
    expect(isUpgradeRequestPending(asked("basic", "2026-09-20"), "free", at("2026-09-21"))).toBe(true);
  });
});
