import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN, PLAN_LIMITS, PLANS, limitsOf } from "@/lib/plans";

describe("Plans and their Limits (plans issue 01)", () => {
  it("PLAN-1: free is the default and the numbers the app shipped with; pro holds any number of Documents and 25 letters a week", () => {
    expect(PLANS).toEqual(["free", "pro"]);
    expect(DEFAULT_PLAN).toBe("free");
    expect(PLAN_LIMITS.free).toEqual({ documents: 3, lettersPerWeek: 5 });
    expect(PLAN_LIMITS.pro).toEqual({ documents: "unlimited", lettersPerWeek: 25 });
    expect(limitsOf("pro")).toEqual(PLAN_LIMITS.pro);
  });
});
