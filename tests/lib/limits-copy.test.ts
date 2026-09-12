import { describe, expect, it } from "vitest";

import { UPLOAD_REFUSALS, capReachedRefusal, roomLeft } from "@/lib/documents";
import { quotaStatus } from "@/lib/generation";

describe("the copy at the two Limit sites takes a Limit (plans issue 01)", () => {
  it("roomLeft counts down to a finite Limit and never runs out under an unlimited one", () => {
    expect(roomLeft(1, 3)).toBe("Room for 2 more");
    expect(roomLeft(3, 3)).toBeNull();
    expect(roomLeft(40, "unlimited")).toBeNull();
    expect(roomLeft(0, "unlimited")).toBeNull();
  });

  it("the cap refusal names the Tenant's own number, and the free number is the map's default", () => {
    expect(capReachedRefusal(3)).toBe(
      "All 3 slots are used. Delete a document you no longer send, then upload this one.",
    );
    expect(capReachedRefusal(50)).toMatch(/^All 50 slots are used\./);
    expect(UPLOAD_REFUSALS["cap-reached"]).toBe(capReachedRefusal(3));
  });

  it("quotaStatus reports what is left under a finite Limit, and 'unlimited' under none", () => {
    expect(quotaStatus(2, "2026-07-20", 5)).toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
      resetsOn: "2026-07-27",
    });
    expect(quotaStatus(9, "2026-07-20", 5)).toMatchObject({ used: 5, remaining: 0 });
    expect(quotaStatus(40, "2026-07-20", "unlimited")).toEqual({
      limit: "unlimited",
      used: 40,
      remaining: "unlimited",
      resetsOn: "2026-07-27",
    });
  });
});
