import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN, PLAN_LIMITS, PLANS, limitsOf, withinLimit } from "@/lib/plans";

describe("Plans and their Limits (plans issue 01)", () => {
  it("PLAN-1: free is the default and the numbers the app shipped with; pro holds any number of Documents and 25 letters a week", () => {
    expect(PLANS).toEqual(["free", "pro"]);
    expect(DEFAULT_PLAN).toBe("free");
    expect(PLAN_LIMITS.free).toEqual({ documents: 3, lettersPerWeek: 5 });
    expect(PLAN_LIMITS.pro).toEqual({ documents: "unlimited", lettersPerWeek: 25 });
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
