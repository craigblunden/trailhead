import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTACT_LIMITS } from "@/lib/contacts";
import {
  contactPatchSchema,
  newContactSchema,
  parseInput,
} from "@/server/validation";
import { FROZEN_NOW } from "../test-utils";

const valid = {
  name: "Dana Whitfield",
  kind: "recruiter",
  title: "Senior Recruiter",
  agency: "Northstar Talent",
  email: "dana@northstar.example",
  phone: "+1 (512) 555-0134",
  notes: "Sends roles on Mondays.",
  linkedinUrl: "https://www.linkedin.com/in/dana-whitfield",
  lastSpokenOn: "2026-07-20",
};

afterEach(() => {
  vi.useRealTimers();
});

function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW); // 2026-07-25
}

describe("newContactSchema (ticket 14)", () => {
  it("CON-V1: accepts a complete contact and trims its text", () => {
    freeze();
    const result = parseInput(newContactSchema, { ...valid, name: "  Dana Whitfield " });
    expect(result).toEqual({ ok: true, data: valid });
  });

  it("CON-V2: requires only name and kind; everything else defaults to blank", () => {
    const result = parseInput(newContactSchema, { name: "Dana", kind: "referrer" });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Dana",
        kind: "referrer",
        title: "",
        agency: "",
        email: "",
        phone: "",
        notes: "",
        linkedinUrl: "",
        lastSpokenOn: null,
      },
    });

    const missing = parseInput(newContactSchema, { name: "  " });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(Object.keys(missing.errors).sort()).toEqual(["kind", "name"]);
  });

  it("CON-V3: kind is exactly one of the four kinds", () => {
    for (const kind of ["recruiter", "hiring_manager", "referrer", "other"]) {
      expect(parseInput(newContactSchema, { name: "D", kind }).ok, kind).toBe(true);
    }
    for (const kind of ["Recruiter", "agency", ""]) {
      expect(parseInput(newContactSchema, { name: "D", kind }).ok, kind).toBe(false);
    }
  });

  it("CON-V4: bounds every text field, accepting the limit and refusing one past it", () => {
    freeze();
    for (const field of ["name", "title", "agency", "phone", "notes"] as const) {
      const limit = CONTACT_LIMITS[field];
      const atLimit = field === "phone" ? "1".repeat(limit) : "a".repeat(limit);
      expect(parseInput(newContactSchema, { ...valid, [field]: atLimit }).ok, `${field} at`).toBe(true);
      const past = parseInput(newContactSchema, { ...valid, [field]: `${atLimit}1` });
      expect(past.ok, `${field} past`).toBe(false);
      if (!past.ok) expect(past.errors).toHaveProperty(field);
    }

    const localPart = "a".repeat(64);
    const domain = `${"b".repeat(CONTACT_LIMITS.email - localPart.length - "@.example".length)}.example`;
    const emailAtLimit = `${localPart}@${domain}`;
    expect(emailAtLimit).toHaveLength(CONTACT_LIMITS.email);
    expect(parseInput(newContactSchema, { ...valid, email: emailAtLimit }).ok).toBe(true);
    expect(parseInput(newContactSchema, { ...valid, email: `a${emailAtLimit}` }).ok).toBe(false);

    const base = "https://www.linkedin.com/in/";
    const urlAtLimit = base + "a".repeat(CONTACT_LIMITS.linkedinUrl - base.length);
    expect(parseInput(newContactSchema, { ...valid, linkedinUrl: urlAtLimit }).ok).toBe(true);
    expect(parseInput(newContactSchema, { ...valid, linkedinUrl: `${urlAtLimit}a` }).ok).toBe(false);
  });

  it("CON-V5: an email must look like one; blank means none", () => {
    for (const email of ["dana", "dana@", "@northstar.example", "dana northstar@x.io"]) {
      const result = parseInput(newContactSchema, { ...valid, email });
      expect(result.ok, email).toBe(false);
      if (!result.ok) expect(result.errors.email).toMatch(/email/i);
    }
    const blank = parseInput(newContactSchema, { name: "D", kind: "other", email: "  " });
    expect(blank.ok && blank.data.email).toBe("");
  });

  it("CON-V6: a phone number is digits, spaces, and + ( ) . - only", () => {
    for (const phone of ["+44 20 7946 0958", "(512) 555.0134", "555-0134"]) {
      expect(parseInput(newContactSchema, { name: "D", kind: "other", phone }).ok, phone).toBe(true);
    }
    for (const phone of ["call me", "555-0134 ext 2", "<script>"]) {
      const result = parseInput(newContactSchema, { name: "D", kind: "other", phone });
      expect(result.ok, phone).toBe(false);
    }
  });

  it("CON-V7: a LinkedIn link that is not http(s) is rejected, like a posting URL", () => {
    for (const linkedinUrl of ["javascript:alert(1)", "data:text/html,x", "linkedin.com/in/dana"]) {
      const result = parseInput(newContactSchema, { name: "D", kind: "other", linkedinUrl });
      expect(result.ok, linkedinUrl).toBe(false);
      if (!result.ok) expect(result.errors.linkedinUrl).toMatch(/http/);
    }
  });

  it("CON-V8: last spoken is a real calendar date, today at the latest, or blank", () => {
    freeze();
    const today = parseInput(newContactSchema, { name: "D", kind: "other", lastSpokenOn: "2026-07-25" });
    expect(today.ok && today.data.lastSpokenOn).toBe("2026-07-25");

    for (const lastSpokenOn of ["", null, undefined]) {
      const blank = parseInput(newContactSchema, { name: "D", kind: "other", lastSpokenOn });
      expect(blank.ok && blank.data.lastSpokenOn).toBeNull();
    }

    const tomorrow = parseInput(newContactSchema, {
      name: "D",
      kind: "other",
      lastSpokenOn: "2026-07-26",
    });
    expect(tomorrow.ok).toBe(false);
    if (!tomorrow.ok) expect(tomorrow.errors.lastSpokenOn).toMatch(/future/);

    for (const lastSpokenOn of ["2026-02-30", "25/07/2026", "yesterday"]) {
      expect(parseInput(newContactSchema, { name: "D", kind: "other", lastSpokenOn }).ok).toBe(false);
    }
  });
});

describe("contactPatchSchema (ticket 14)", () => {
  it("CON-V9: accepts any subset of the contact's own fields, validated the same way", () => {
    expect(parseInput(contactPatchSchema, { kind: "hiring_manager" })).toEqual({
      ok: true,
      data: { kind: "hiring_manager" },
    });
    expect(parseInput(contactPatchSchema, { name: "" }).ok).toBe(false);
    expect(parseInput(contactPatchSchema, { email: "nope" }).ok).toBe(false);
    expect(parseInput(contactPatchSchema, {})).toEqual({ ok: true, data: {} });
  });

  it("CON-V9: is an allowlist — a field outside it is rejected, not dropped", () => {
    for (const patch of [{ userId: "x" }, { jobs: [] }, { name: "D", createdAt: "2026-01-01" }]) {
      expect(parseInput(contactPatchSchema, patch).ok, JSON.stringify(patch)).toBe(false);
    }
  });
});
