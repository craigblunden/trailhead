import { describe, expect, it } from "vitest";

import {
  JOB_LIMITS,
  jobPatchSchema,
  newJobSchema,
  parseInput,
  stageSchema,
} from "@/server/validation";

const valid = {
  company: "Alpine Robotics",
  role: "Principal Designer",
  location: "Remote (US)",
  salaryMin: 160,
  salaryMax: 190,
  postingUrl: "https://alpine.example.com/jobs/1",
  description: "Robots, mostly.",
};

describe("newJobSchema", () => {
  it("VAL-1: accepts a complete, well-formed job and trims its text", () => {
    const result = parseInput(newJobSchema, { ...valid, company: "  Alpine Robotics  " });

    expect(result).toEqual({ ok: true, data: { ...valid, company: "Alpine Robotics" } });
  });

  it("VAL-2: requires company and role", () => {
    const result = parseInput(newJobSchema, { ...valid, company: "", role: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["company", "role"]);
  });

  it("VAL-3: falls back to the Phase-1 default for a blank location", () => {
    for (const location of ["", "   ", undefined]) {
      const result = parseInput(newJobSchema, { ...valid, location });
      expect(result.ok && result.data.location).toBe("Location TBD");
    }
  });

  it("VAL-4: treats blank or non-numeric salary bounds as unknown, not as zero", () => {
    const cases = ["", "  ", "abc", null, undefined, "12abc"];
    for (const value of cases) {
      const result = parseInput(newJobSchema, { ...valid, salaryMin: value, salaryMax: value });
      expect(result.ok, String(value)).toBe(true);
      if (!result.ok) continue;
      expect(result.data.salaryMin).toBeNull();
      expect(result.data.salaryMax).toBeNull();
    }
  });

  it("VAL-4: accepts numeric strings and keeps zero as a real bound", () => {
    const result = parseInput(newJobSchema, { ...valid, salaryMin: "0", salaryMax: "150" });

    expect(result.ok && result.data.salaryMin).toBe(0);
    expect(result.ok && result.data.salaryMax).toBe(150);
  });

  it("VAL-4: rejects a negative or non-integer salary bound rather than storing it", () => {
    for (const value of [-1, 12.5, 1_000_000]) {
      const result = parseInput(newJobSchema, { ...valid, salaryMin: value });
      expect(result.ok, String(value)).toBe(false);
      if (result.ok) continue;
      expect(result.errors).toHaveProperty("salaryMin");
    }
  });

  it("VAL-5: neutralises a javascript: posting URL at the boundary", () => {
    const result = parseInput(newJobSchema, {
      ...valid,
      postingUrl: "javascript:alert(document.domain)",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.postingUrl).toMatch(/http/);
  });

  it("VAL-5: rejects data: and other non-web schemes, and accepts blank as no link", () => {
    for (const postingUrl of ["data:text/html,<b>x</b>", "file:///etc/passwd", "not a url"]) {
      expect(parseInput(newJobSchema, { ...valid, postingUrl }).ok, postingUrl).toBe(false);
    }
    const blank = parseInput(newJobSchema, { ...valid, postingUrl: "" });
    expect(blank.ok && blank.data.postingUrl).toBe("");
    const missing = parseInput(newJobSchema, { ...valid, postingUrl: undefined });
    expect(missing.ok && missing.data.postingUrl).toBe("");
  });

  it("VAL-6: bounds every free-text field, accepting the limit and refusing one past it", () => {
    const fields = ["company", "role", "location", "postingUrl", "description"] as const;
    for (const field of fields) {
      const limit = JOB_LIMITS[field];
      const atLimit =
        field === "postingUrl"
          ? `https://x.example/${"a".repeat(limit - "https://x.example/".length)}`
          : "a".repeat(limit);
      const pastLimit = atLimit + "a";

      expect(parseInput(newJobSchema, { ...valid, [field]: atLimit }).ok, `${field} at limit`).toBe(
        true,
      );
      const result = parseInput(newJobSchema, { ...valid, [field]: pastLimit });
      expect(result.ok, `${field} past limit`).toBe(false);
      if (!result.ok) expect(result.errors).toHaveProperty(field);
    }
  });

  it("VAL-7: refuses input that is not an object at all", () => {
    expect(parseInput(newJobSchema, null).ok).toBe(false);
    expect(parseInput(newJobSchema, "company=Acme").ok).toBe(false);
  });
});

describe("jobPatchSchema", () => {
  it("VAL-8: allows description and notes, bounded", () => {
    const result = parseInput(jobPatchSchema, { description: "New", notes: "Ask about team size" });
    expect(result).toEqual({ ok: true, data: { description: "New", notes: "Ask about team size" } });

    const tooLong = parseInput(jobPatchSchema, { notes: "n".repeat(JOB_LIMITS.notes + 1) });
    expect(tooLong.ok).toBe(false);
  });

  it("VAL-8: is an allowlist — a field outside it is rejected, not silently dropped", () => {
    for (const patch of [
      { stage: "offer" },
      { company: "Renamed Co" },
      { userId: "someone-else" },
      { notes: "fine", appliedOn: "2026-01-01" },
    ]) {
      const result = parseInput(jobPatchSchema, patch);
      expect(result.ok, JSON.stringify(patch)).toBe(false);
    }
  });

  it("VAL-8: an empty patch is valid and changes nothing", () => {
    expect(parseInput(jobPatchSchema, {})).toEqual({ ok: true, data: {} });
  });
});

describe("stageSchema", () => {
  it("VAL-9: accepts exactly the five stages", () => {
    for (const stage of ["interested", "applied", "interviewing", "offer", "rejected"]) {
      expect(parseInput(stageSchema, stage).ok).toBe(true);
    }
    expect(parseInput(stageSchema, "Applied").ok).toBe(false);
    expect(parseInput(stageSchema, "archived").ok).toBe(false);
  });
});
