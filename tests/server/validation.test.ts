import { describe, expect, it } from "vitest";

import { CONTACT_LIMITS } from "@/lib/contacts";
import { FEEDBACK_MAX_CHARS } from "@/lib/generation";
import { LOCATION_FALLBACK, locationOrFallback, salaryFromText } from "@/lib/job-fields";
import {
  JOB_LIMITS,
  coverLetterRequestSchema,
  isChosenContact,
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

describe("the contact a new job may carry", () => {
  const newPerson = {
    name: "Dana Pike",
    kind: "recruiter",
    title: "Talent Partner",
    agency: "Northstar Talent",
    email: "dana@northstar.example",
    phone: "0400 000 000",
    linkedinUrl: "",
  };

  it("VAL-10: an absent, undefined, or null contact all mean nobody was entered", () => {
    for (const contact of [undefined, null]) {
      expect(parseInput(newJobSchema, { ...valid, contact })).toMatchObject({ ok: true });
    }
    expect(parseInput(newJobSchema, valid)).toMatchObject({ ok: true });
  });

  it("VAL-10: accepts one of the user's own, named only by id", () => {
    const result = parseInput(newJobSchema, { ...valid, contact: { contactId: "  c1  " } });

    expect(result.ok && result.data.contact).toEqual({ contactId: "c1" });
    expect(result.ok && isChosenContact(result.data.contact!)).toBe(true);
  });

  it("VAL-10: a chosen contact carries nothing but the id — no name to copy in beside it", () => {
    const result = parseInput(newJobSchema, {
      ...valid,
      contact: { contactId: "c1", name: "Someone Else" },
    });

    expect(result.ok).toBe(false);
  });

  it("VAL-10: an id sent alongside a whole person is refused, never quietly saved as a new one", () => {
    // Dropping the unknown `contactId` here would link nobody and create a second Dana Pike —
    // exactly the duplicate that choosing an existing contact exists to prevent.
    const result = parseInput(newJobSchema, {
      ...valid,
      contact: { contactId: "c1", ...newPerson },
    });

    expect(result.ok).toBe(false);
  });

  it("VAL-11: accepts a whole new person, trimmed, and reads them as new rather than chosen", () => {
    const result = parseInput(newJobSchema, {
      ...valid,
      contact: { ...newPerson, name: "  Dana Pike  " },
    });

    expect(result.ok && result.data.contact).toEqual(newPerson);
    expect(result.ok && isChosenContact(result.data.contact!)).toBe(false);
  });

  it("VAL-11: a new person needs a name — the rest is no use without one", () => {
    const result = parseInput(newJobSchema, { ...valid, contact: { ...newPerson, name: "   " } });

    expect(result.ok).toBe(false);
  });

  it("VAL-11: holds a contact entered beside a job to the contacts page's own rules", () => {
    const refused = [
      { ...newPerson, email: "not-an-email" },
      { ...newPerson, phone: "call me" },
      { ...newPerson, kind: "friend" },
      { ...newPerson, name: "x".repeat(CONTACT_LIMITS.name + 1) },
      { ...newPerson, linkedinUrl: "javascript:alert(1)" },
    ];
    for (const contact of refused) {
      expect(parseInput(newJobSchema, { ...valid, contact }).ok, JSON.stringify(contact)).toBe(
        false,
      );
    }
  });

  it("VAL-11: notes and last spoken are not offered here — they belong on the contact's page", () => {
    const result = parseInput(newJobSchema, {
      ...valid,
      contact: { ...newPerson, notes: "Met at a meetup", lastSpokenOn: "2026-07-01" },
    });

    expect(result.ok).toBe(false);
  });
});

describe("jobPatchSchema", () => {
  it("VAL-8: allows description, notes, and the salary expectation, bounded", () => {
    const result = parseInput(jobPatchSchema, { description: "New", notes: "Ask about team size" });
    expect(result).toEqual({ ok: true, data: { description: "New", notes: "Ask about team size" } });

    const salary = parseInput(jobPatchSchema, { salaryMin: "150", salaryMax: "" });
    expect(salary).toEqual({ ok: true, data: { salaryMin: 150, salaryMax: null } });

    const tooLong = parseInput(jobPatchSchema, { notes: "n".repeat(JOB_LIMITS.notes + 1) });
    expect(tooLong.ok).toBe(false);
  });

  it("VAL-8: allows the details typed when adding, read by the same rules as adding", () => {
    const result = parseInput(jobPatchSchema, {
      company: "  Renamed Co ",
      role: "Staff Designer",
      location: "   ",
      postingUrl: " https://renamed.example.com/jobs/2 ",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        company: "Renamed Co",
        role: "Staff Designer",
        location: LOCATION_FALLBACK,
        postingUrl: "https://renamed.example.com/jobs/2",
      },
    });

    expect(parseInput(jobPatchSchema, { postingUrl: "" })).toEqual({ ok: true, data: { postingUrl: "" } });

    for (const patch of [
      { company: "  " },
      { role: "" },
      { postingUrl: "javascript:alert(1)" },
      { location: "l".repeat(JOB_LIMITS.location + 1) },
    ]) {
      expect(parseInput(jobPatchSchema, patch).ok, JSON.stringify(patch)).toBe(false);
    }
  });

  it("VAL-8: is an allowlist — a field outside it is rejected, not silently dropped", () => {
    for (const patch of [
      { stage: "offer" },
      { accent: "teal" },
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

describe("the forms read what validation reads (architecture ticket 01)", () => {
  it("VAL-10: a salary the form sends parses exactly as the text it was read from", () => {
    for (const text of ["", "  ", "120", " 150 ", "0", "abc", "12abc", "1e6", "1.5", "-3", "1000000"]) {
      const fromText = parseInput(jobPatchSchema, { salaryMin: text });
      const fromForm = parseInput(jobPatchSchema, { salaryMin: salaryFromText(text) });
      expect(fromForm, JSON.stringify(text)).toEqual(fromText);
    }
  });

  it("VAL-10: a blank location reads as the default on both sides", () => {
    for (const text of ["", "   ", "Remote (US)", "  Austin  "]) {
      const parsed = parseInput(newJobSchema, { ...valid, location: text });
      expect(parsed.ok && parsed.data.location, JSON.stringify(text)).toBe(locationOrFallback(text));
    }
    expect(locationOrFallback(" ")).toBe(LOCATION_FALLBACK);
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

describe("coverLetterRequestSchema (feedback issue 02)", () => {
  it("VAL-F1: no body, a null feedback, and blank feedback all read as a fresh write", () => {
    for (const input of [{}, { feedback: null }, { feedback: "   " }]) {
      expect(parseInput(coverLetterRequestSchema, input)).toEqual({ ok: true, data: { feedback: "" } });
    }
  });

  it("VAL-F2: strips invisible characters and trims before measuring; exactly 500 is accepted, 501 is not", () => {
    const stripped = parseInput(coverLetterRequestSchema, { feedback: "  sho\u200Brter\u200E, please \uFEFF " });
    expect(stripped).toEqual({ ok: true, data: { feedback: "shorter, please" } });

    // Invisible characters do not count: 500 visible characters padded with them is still 500.
    const padded = `${"x".repeat(FEEDBACK_MAX_CHARS)}${"\u200B".repeat(40)}`;
    expect(parseInput(coverLetterRequestSchema, { feedback: padded })).toMatchObject({ ok: true });
    expect(parseInput(coverLetterRequestSchema, { feedback: "x".repeat(FEEDBACK_MAX_CHARS + 1) })).toEqual({
      ok: false,
      errors: { feedback: `Keep feedback under ${FEEDBACK_MAX_CHARS} characters` },
    });
  });

  it("VAL-F3: feedback that is not text is refused, not coerced", () => {
    expect(parseInput(coverLetterRequestSchema, { feedback: 42 })).toMatchObject({ ok: false });
    expect(parseInput(coverLetterRequestSchema, { feedback: ["shorter"] })).toMatchObject({ ok: false });
  });
});
