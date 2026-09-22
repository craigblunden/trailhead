import { describe, expect, it } from "vitest";

import {
  FOOTING_CRITERIA,
  FOOTING_DIMENSIONS,
  FOOTING_DIMENSION_BLURB,
  FOOTING_DIMENSION_LABEL,
  FOOTING_FAILURES,
  FOOTING_LEVELS,
  LOW_CONFIDENCE,
  OVERALL_DIMENSIONS,
  WEIGHTS,
  bandMove,
  changedSince,
  comparisonFor,
  isOverallUnclear,
  isUnclear,
  meanConfidence,
  normalise,
  overallBand,
  overallScore,
  staleLine,
  type Footing,
  type FootingDimension,
  type FootingStamp,
} from "@/lib/footing";
import { NOT_READY_LABEL, SCORE_BAND_LABEL, scoreBand } from "@/lib/interview";

/**
 * The Footing's arithmetic and its words (footing tickets 01, 05). Pure throughout: no provider, no
 * database.
 */

const footing = (
  dimensions: Partial<Record<FootingDimension, number>>,
  { confidence = 0.8, id = "f1", scoredAt = "2026-09-22T10:00:00.000Z" } = {},
): Footing => ({
  id,
  jobId: "job-1",
  scoredAt,
  changed: [],
  dimensions: Object.entries(dimensions).map(([dimension, score]) => ({
    dimension: dimension as FootingDimension,
    score: score!,
    confidence,
  })),
});

const stamp = (overrides: Partial<FootingStamp> = {}): FootingStamp => ({
  resumeId: "doc-resume",
  coverLetterId: "doc-letter",
  resumeHash: "r1",
  descriptionHash: "d1",
  coverLetterHash: "c1",
  ...overrides,
});

describe("footing ticket 01: the five dimensions", () => {
  it("FOOT-1: the overall is the four that describe the Tenant — never the Letter", () => {
    expect(FOOTING_DIMENSIONS).toEqual(["skills", "experience", "domain", "proof_of_work", "letter"]);
    expect(OVERALL_DIMENSIONS).toEqual(["skills", "experience", "domain", "proof_of_work"]);
    expect(Object.keys(WEIGHTS)).not.toContain("letter");
  });

  it("FOOT-2: the weights sum to one, so the overall is a weighted average and not a scaled one", () => {
    expect(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
  });

  it("FOOT-3: every dimension is named and explained wherever it is shown", () => {
    for (const dimension of FOOTING_DIMENSIONS) {
      expect(FOOTING_DIMENSION_LABEL[dimension]).toBeTruthy();
      expect(FOOTING_DIMENSION_BLURB[dimension]).toBeTruthy();
    }
  });
});

describe("footing ticket 01: the levels", () => {
  it("FOOT-4: every dimension has exactly five ordered levels", () => {
    for (const dimension of FOOTING_DIMENSIONS) {
      expect(FOOTING_CRITERIA[dimension], dimension).toHaveLength(FOOTING_LEVELS);
    }
  });

  it("FOOT-5: the levels of one dimension carry identical fields, so none reads as better specified", () => {
    for (const dimension of FOOTING_DIMENSIONS) {
      const shapes = FOOTING_CRITERIA[dimension].map((level) => Object.keys(level).sort().join(","));
      expect(new Set(shapes), dimension).toEqual(new Set([shapes[0]]));
    }
  });

  it("FOOT-6: levels describe situations, never degrees", () => {
    const degrees = /\b(moderately|somewhat|fairly|quite|very|extremely|poor|excellent|good|average)\b/i;
    for (const dimension of FOOTING_DIMENSIONS) {
      for (const level of FOOTING_CRITERIA[dimension]) {
        expect(level.what, `${dimension}: ${level.what}`).not.toMatch(degrees);
      }
    }
  });
});

describe("footing ticket 01: normalising, and why there are five levels", () => {
  it("FOOT-7: the five exact levels land on 0 / 25 / 50 / 75 / 100", () => {
    expect([0, 1, 2, 3, 4].map((level) => normalise(level))).toEqual([0, 25, 50, 75, 100]);
  });

  it("FOOT-8: each of those bands through the Scorecard's own scale, with every band used", () => {
    expect([0, 25, 50, 75, 100].map(scoreBand)).toEqual([
      "not-there-yet",
      "not-there-yet",
      "developing",
      "solid",
      "strong",
    ]);
  });

  it("FOOT-9: four levels would have left `developing` almost nowhere — the reason five was chosen", () => {
    // 0 / 33 / 67 / 100: `developing` (40–59) gets nothing, and two of four land in the lowest band.
    const four = [0, 1, 2, 3].map((level) => normalise(level, 4));
    expect(four).toEqual([0, 33, 67, 100]);
    expect(four.map(scoreBand)).not.toContain("developing");
  });

  it("FOOT-10: a position between two levels normalises between them, and one outside is clamped", () => {
    expect(normalise(2.5)).toBe(63);
    expect(normalise(-1)).toBe(0);
    expect(normalise(9)).toBe(100);
  });
});

describe("footing ticket 01: the overall, derived at read time", () => {
  it("FOOT-11: is the four weighted together, and ignores the Letter entirely", () => {
    const scored = footing({ skills: 100, experience: 50, domain: 0, proof_of_work: 50, letter: 0 });
    // 0.3·100 + 0.3·50 + 0.2·0 + 0.2·50 = 55
    expect(overallScore(scored)).toBe(55);
    expect(overallBand(scored)).toBe("developing");
  });

  it("FOOT-12: a rewritten letter cannot move it", () => {
    const four = { skills: 75, experience: 75, domain: 75, proof_of_work: 75 };
    expect(overallScore(footing({ ...four, letter: 0 }))).toBe(overallScore(footing({ ...four, letter: 100 })));
  });

  it("FOOT-13: a missing dimension renormalises rather than reading as a zero", () => {
    expect(overallScore(footing({ skills: 80, experience: 60 }))).toBe(70);
    expect(overallScore(footing({ letter: 100 }))).toBeNull();
    expect(overallBand(footing({}))).toBeNull();
  });
});

describe("footing ticket 01: confidence", () => {
  it("FOOT-14: a dimension below the threshold is not clear-cut; one at it is", () => {
    expect(isUnclear({ dimension: "skills", score: 50, confidence: LOW_CONFIDENCE - 0.01 })).toBe(true);
    expect(isUnclear({ dimension: "skills", score: 50, confidence: LOW_CONFIDENCE })).toBe(false);
  });

  it("FOOT-15: the mean is across the four, so a shaky letter does not make the reading shaky", () => {
    const scored: Footing = {
      ...footing({}),
      dimensions: [
        { dimension: "skills", score: 75, confidence: 0.9 },
        { dimension: "experience", score: 75, confidence: 0.9 },
        { dimension: "domain", score: 75, confidence: 0.9 },
        { dimension: "proof_of_work", score: 75, confidence: 0.9 },
        { dimension: "letter", score: 0, confidence: 0.01 },
      ],
    };
    expect(meanConfidence(scored)).toBeCloseTo(0.9, 10);
    expect(isOverallUnclear(scored)).toBe(false);
  });

  it("FOOT-16: a reading that is shaky throughout is said once, above the breakdown", () => {
    expect(isOverallUnclear(footing({ skills: 50, experience: 50 }, { confidence: 0.2 }))).toBe(true);
  });
});

describe("footing ticket 03: what changed since it ran", () => {
  it("FOOT-17: an unchanged Job leaves the Footing current", () => {
    expect(changedSince(stamp(), stamp())).toEqual([]);
    expect(staleLine([])).toBe("");
  });

  it("FOOT-18: a different text, or a different Document, is a change of that thing", () => {
    expect(changedSince(stamp(), stamp({ resumeHash: "r2" }))).toEqual(["resume"]);
    expect(changedSince(stamp(), stamp({ resumeId: "doc-other" }))).toEqual(["resume"]);
    expect(changedSince(stamp(), stamp({ coverLetterId: null, coverLetterHash: "" }))).toEqual(["letter"]);
    expect(changedSince(stamp(), stamp({ descriptionHash: "d2" }))).toEqual(["description"]);
  });

  it("FOOT-19: a deleted resume leaves the Footing permanently stale rather than taking it away", () => {
    // The Job's reference is cleared when the Document goes; the Footing's stamp outlives it.
    expect(changedSince(stamp(), stamp({ resumeId: null, resumeHash: "" }))).toEqual(["resume"]);
  });

  it("FOOT-20: the line names everything that moved, and reads as a sentence", () => {
    expect(staleLine(["resume"])).toBe("Your resume has changed since this ran.");
    expect(staleLine(["resume", "description"])).toBe(
      "Your resume and the job description have changed since this ran.",
    );
    expect(staleLine(["resume", "letter", "description"])).toBe(
      "Your resume, your cover letter and the job description have changed since this ran.",
    );
  });
});

describe("footing ticket 05: what changed since last time", () => {
  const strong = footing({ skills: 100, experience: 100, domain: 100, proof_of_work: 100 }, { id: "new" });
  const weak = footing({ skills: 0, experience: 0, domain: 0, proof_of_work: 0 }, { id: "old" });

  it("FOOT-21: a single Footing says nothing about a trend", () => {
    expect(comparisonFor(strong, null)).toBeNull();
  });

  it("FOOT-22: two Footings in different bands produce the sentence, in the right direction", () => {
    expect(bandMove(strong, weak)).toBe("stronger");
    expect(comparisonFor(strong, weak)).toBe("Stronger than last time on this one — strong now.");
    expect(comparisonFor(weak, strong)).toBe("Weaker than last time on this one — not there yet now.");
  });

  it("FOOT-23: a move inside one band is not dressed up as improvement", () => {
    const before = footing({ skills: 60, experience: 60, domain: 60, proof_of_work: 60 });
    const after = footing({ skills: 65, experience: 65, domain: 65, proof_of_work: 65 });
    expect(scoreBand(overallScore(after)!)).toBe(scoreBand(overallScore(before)!));
    expect(bandMove(after, before)).toBe("steady");
    expect(comparisonFor(after, before)).toBe("About where it was last time — still solid.");
  });

  it("FOOT-24: the sentence never carries a number", () => {
    for (const [a, b] of [
      [strong, weak],
      [weak, strong],
      [strong, strong],
    ] as const) {
      expect(comparisonFor(a, b)).not.toMatch(/\d/);
    }
  });
});

describe("footing ticket 03: the refusals", () => {
  it("FOOT-25: the two a Job can earn are the readiness vocabulary, not a second one", () => {
    expect(FOOTING_FAILURES["no-resume"]).toBe(NOT_READY_LABEL["no-resume"]);
    expect(FOOTING_FAILURES["no-description"]).toBe(NOT_READY_LABEL["no-description"]);
  });

  it("FOOT-26: every failure has words that say what happened", () => {
    for (const [code, message] of Object.entries(FOOTING_FAILURES)) {
      expect(message.length, code).toBeGreaterThan(5);
    }
  });

  it("FOOT-27: no band vocabulary of its own — the Scorecard's words, or none", () => {
    expect(Object.values(SCORE_BAND_LABEL)).toEqual(["Strong", "Solid", "Developing", "Not there yet"]);
  });
});
