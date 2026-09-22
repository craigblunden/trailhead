import { describe, expect, it } from "vitest";

import { JOB_LIMITS, capText } from "@/lib/job-fields";

describe("capText", () => {
  it("FLD-1: leaves text inside the cap alone, but for the trim every field already gets", () => {
    expect(capText("Ask about the design team's size.", 2_000)).toBe("Ask about the design team's size.");
    expect(capText("  padded  ", 2_000)).toBe("padded");
    expect(capText("", 2_000)).toBe("");
  });

  it("FLD-2: keeps text at exactly the cap whole", () => {
    const atCap = "a".repeat(JOB_LIMITS.notes);
    expect(capText(atCap, JOB_LIMITS.notes)).toBe(atCap);
  });

  it("FLD-3: strips the excess rather than refusing it", () => {
    const past = "a".repeat(JOB_LIMITS.notes + 500);
    expect(capText(past, JOB_LIMITS.notes)).toHaveLength(JOB_LIMITS.notes);
  });

  it("FLD-4: trims before it counts, so padding never costs a field its last characters", () => {
    const padded = `   ${"a".repeat(10)}   `;
    expect(capText(padded, 10)).toBe("a".repeat(10));
  });

  it("FLD-5: never cuts through the middle of a surrogate pair — half an emoji is not storable text", () => {
    // Ten code units: eight letters and one two-unit emoji.
    const text = `${"a".repeat(8)}🏔`;
    const cut = capText(text, 9);
    expect(cut).toBe("a".repeat(8));
    expect(cut).not.toMatch(/[\uD800-\uDBFF]$/);
    // Room for the whole pair keeps it.
    expect(capText(text, 10)).toBe(text);
  });

  it("FLD-6: leaves no trailing whitespace where the cut lands mid-space", () => {
    expect(capText("one two three", 8)).toBe("one two");
  });
});
