import { describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  FILES_ARE_NEVER_SENT,
  TERMS_VERSION,
  WHAT_WE_DO_NOT_DO,
  formatTermsDate,
  providerSummary,
} from "@/lib/terms";

/**
 * The disclosure's facts, pinned (terms tickets 01–03). What these guard is not formatting: it is
 * that the page cannot quietly turn a commitment into a disclaimer, and that the version the gate
 * records is the version the pages are dated with.
 */

describe("terms ticket 03: the version", () => {
  it("TERMS-1: is one dated version the pages can print", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatTermsDate(TERMS_VERSION)).toBe("September 22, 2026");
  });

  it("TERMS-2: formats a version in UTC, so the date never slips a day by timezone", () => {
    expect(formatTermsDate("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("terms ticket 02: what the privacy page says", () => {
  it("TERMS-3: names both providers, and only those two", () => {
    expect(AI_PROVIDERS.map((provider) => provider.name)).toEqual(["Anthropic", "TypeSafe"]);
  });

  it("TERMS-4: quotes each no-training commitment verbatim, and attributes it", () => {
    const [anthropic, typesafe] = AI_PROVIDERS;
    expect(anthropic.quote).toBe("Anthropic may not train models on Customer Content from Services.");
    expect(anthropic.quoteSource).toBe("Anthropic Commercial Terms of Service");
    expect(typesafe.quote).toBe(
      "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input.",
    );
    expect(typesafe.quoteSource).toBe("TypeSafe privacy policy");
  });

  it("TERMS-5: states Anthropic's retention as 30 days, and TypeSafe's as the unknown it is", () => {
    const [anthropic, typesafe] = AI_PROVIDERS;
    expect(anthropic.retention).toContain("30 days");
    // Specific about what is unknown, rather than vague about everything: no number, said as no number.
    expect(typesafe.retention).toContain("No period is published");
    expect(typesafe.retention).not.toMatch(/\d+ days?/); // …and nothing in it reads as one.
  });

  it("TERMS-6: never writes a disclaimer where a commitment exists", () => {
    const prose = [
      ...AI_PROVIDERS.flatMap((provider) => [provider.retention, provider.usedFor, provider.quote]),
      FILES_ARE_NEVER_SENT,
      ...WHAT_WE_DO_NOT_DO,
    ].join(" ");
    expect(prose).not.toMatch(/cannot determine|unable to determine|we cannot tell whether/i);
  });

  it("TERMS-7: says the files themselves are never sent", () => {
    expect(FILES_ARE_NEVER_SENT).toMatch(/never sent/i);
    for (const provider of AI_PROVIDERS) {
      expect(provider.sends.join(" ")).toMatch(/text/);
    }
  });
});

describe("terms ticket 04: the gate's summary", () => {
  it("TERMS-8: names the provider and what it is used for, and says neither trains on it", () => {
    expect(AI_PROVIDERS.map(providerSummary)).toEqual([
      "Anthropic — Cover letters, interview question sets, and scoring an interview attempt. Neither trains on it.",
      "TypeSafe — Scoring your footing on a job. Neither trains on it.",
    ]);
  });
});
