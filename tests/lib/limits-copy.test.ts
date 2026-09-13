import { describe, expect, it } from "vitest";

import { UPLOAD_REFUSALS, limitReachedRefusal, roomLeft } from "@/lib/documents";
import { quotaStatus } from "@/lib/generation";

describe("the copy at the two Limit sites takes a Limit (plans issue 01)", () => {
  it("roomLeft counts down to a finite Limit and never runs out under an unlimited one", () => {
    expect(roomLeft(1, 3)).toBe("Room for 2 more");
    expect(roomLeft(3, 3)).toBeNull();
    expect(roomLeft(40, "unlimited")).toBeNull();
    expect(roomLeft(0, "unlimited")).toBeNull();
  });

  it("the Limit refusal names the Tenant's own number, and the code's default names none", () => {
    expect(limitReachedRefusal(3)).toBe(
      "All 3 slots are used. Delete a document you no longer send, then upload this one.",
    );
    expect(limitReachedRefusal(50)).toMatch(/^All 50 slots are used\./);
    expect(UPLOAD_REFUSALS["cap-reached"]).not.toMatch(/\d/);
  });

  it("quotaStatus reports what is left under a finite Limit, and 'unlimited' under none", () => {
    expect(quotaStatus({ used: 2, flagged: 0 }, "2026-07-20", 5)).toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
      resetsOn: "2026-07-27",
      flags: 0,
      held: false,
    });
    expect(quotaStatus({ used: 9, flagged: 0 }, "2026-07-20", 5)).toMatchObject({ used: 5, remaining: 0 });
    // On Hold at two Flags, whatever is left; one Flag is only a count.
    expect(quotaStatus({ used: 1, flagged: 1 }, "2026-07-20", 5)).toMatchObject({ flags: 1, held: false, remaining: 4 });
    expect(quotaStatus({ used: 1, flagged: 2 }, "2026-07-20", 5)).toMatchObject({ flags: 2, held: true, remaining: 4 });
    expect(quotaStatus({ used: 40, flagged: 0 }, "2026-07-20", "unlimited")).toEqual({
      limit: "unlimited",
      used: 40,
      remaining: "unlimited",
      resetsOn: "2026-07-27",
      flags: 0,
      held: false,
    });
  });
});
