import { describe, expect, it } from "vitest";

import {
  ANSWER_MINUTES,
  ATTEMPT_LENGTHS,
  CATEGORIES,
  CATEGORY_MIX,
  INTERVIEW_PLAN,
  attemptSeconds,
  canStartAttempt,
  formatClock,
  formatMinutes,
  interviewQuotaStatus,
  isAttemptLength,
  isKnownLength,
  isComplete,
  isScored,
  isUnreached,
  nextQuestion,
  questionCount,
  remainingSeconds,
  rollUp,
  SCORE_BAND_LABEL,
  scoreBand,
  starsFor,
  starsLabel,
  type Attempt,
  type AttemptQuestion,
  type Category,
} from "@/lib/interview";
import { PLANS, PLAN_LIMITS } from "@/lib/plans";

/**
 * The Interview Simulator's pure rules, on both sides of the boundary: the Category mix, the
 * active-time countdown, where a resumed Attempt picks up, and the Scorecard's rollups.
 */

const question = (
  order: number,
  category: Category,
  answer?: { transcript?: string; score?: number | null; rationale?: string },
): AttemptQuestion => ({
  id: `q${order}`,
  category,
  order,
  text: `${category}?`,
  ...(answer
    ? {
        answer: {
          transcript: answer.transcript ?? "Said something.",
          score: answer.score ?? null,
          whatLanded: "",
          missedPoints: [],
          rationale: answer.rationale ?? "",
        },
      }
    : {}),
});

const attempt = (questions: AttemptQuestion[], overrides: Partial<Attempt> = {}): Attempt => ({
  id: "attempt-1",
  jobId: "job-1",
  length: 5,
  activeSeconds: 0,
  completedAt: null,
  overallScore: null,
  takeaway: [],
  questions,
  ...overrides,
});

describe("the Category mix (ticket 05; interview second pass ticket 04)", () => {
  it("IV-1: every length spans all five Categories, and the counts are the spec's table", () => {
    expect(ATTEMPT_LENGTHS).toEqual([15, 20, 30]);
    expect(CATEGORIES).toEqual(["personal", "behavioural", "stakeholder", "technical", "design"]);
    for (const length of ATTEMPT_LENGTHS) {
      for (const category of CATEGORIES) expect(CATEGORY_MIX[length][category]).toBeGreaterThan(0);
    }
    expect(CATEGORY_MIX[15]).toEqual({ personal: 1, behavioural: 1, stakeholder: 1, technical: 1, design: 1 });
    expect(CATEGORY_MIX[20]).toEqual({ personal: 2, behavioural: 2, stakeholder: 2, technical: 1, design: 1 });
    expect(CATEGORY_MIX[30]).toEqual({ personal: 2, behavioural: 3, stakeholder: 3, technical: 2, design: 2 });
  });

  it("IV-2: the totals are 5, 8, and 12 questions, and the countdown is the length in minutes", () => {
    expect(ATTEMPT_LENGTHS.map(questionCount)).toEqual([5, 8, 12]);
    expect(attemptSeconds(15)).toBe(900);
    expect(attemptSeconds(30)).toBe(1_800);
    // A retired length still has its countdown, so an Attempt started at one resumes on its own clock.
    expect(attemptSeconds(5)).toBe(300);
  });

  it("IV-3: only the three offered lengths may be started; the two retired ones are still known", () => {
    expect([15, 20, 30].every(isAttemptLength)).toBe(true);
    for (const value of [0, 1, 5, 10, 45, "15", null, undefined, NaN]) expect(isAttemptLength(value)).toBe(false);
    expect([5, 10, 15, 20, 30].every(isKnownLength)).toBe(true);
    for (const value of [0, 45, "5", null]) expect(isKnownLength(value)).toBe(false);
  });

  it("IV-3b: each Category has its own answer time, and each mix's answer times add up to within a couple of minutes of its countdown", () => {
    expect(ANSWER_MINUTES).toEqual({ personal: 1.5, behavioural: 2.5, stakeholder: 2, technical: 3, design: 4 });
    for (const length of ATTEMPT_LENGTHS) {
      const planned = CATEGORIES.reduce((total, category) => total + CATEGORY_MIX[length][category] * ANSWER_MINUTES[category], 0);
      expect(Math.abs(planned - length), `${length} minutes plans ${planned}`).toBeLessThanOrEqual(2);
    }
  });

  it("IV-3c: an answer time reads in whole and half minutes", () => {
    expect(CATEGORIES.map((category) => formatMinutes(ANSWER_MINUTES[category]))).toEqual(["1½", "2½", "2", "3", "4"]);
    expect(formatMinutes(0.5)).toBe("½");
  });
});

describe("which Plans may run one (ticket 08)", () => {
  it("IV-4: the simulator runs on pro this phase; free and basic see the locked preview", () => {
    expect(INTERVIEW_PLAN).toBe("pro");
    expect(PLANS.filter(canStartAttempt)).toEqual(["pro"]);
  });

  it("IV-5: every Plan still carries a real Attempts-per-week Limit and its own length choices", () => {
    expect(PLAN_LIMITS.free.interviewsPerWeek).toBe(1);
    expect(PLAN_LIMITS.basic.interviewsPerWeek).toBe(3);
    expect(PLAN_LIMITS.pro.interviewsPerWeek).toBe(10);
    expect(PLAN_LIMITS.free.interviewLengths).toEqual([15]);
    expect(PLAN_LIMITS.basic.interviewLengths).toEqual([15, 20]);
    expect(PLAN_LIMITS.pro.interviewLengths).toEqual([15, 20, 30]);
  });
});

describe("the countdown (tickets 02, 04)", () => {
  it("IV-6: time left is the budget less the active seconds, and never negative", () => {
    expect(remainingSeconds({ length: 5, activeSeconds: 0 })).toBe(300);
    expect(remainingSeconds({ length: 5, activeSeconds: 120 })).toBe(180);
    expect(remainingSeconds({ length: 5, activeSeconds: 300 })).toBe(0);
    // A clock that over-reported cannot show a negative countdown.
    expect(remainingSeconds({ length: 5, activeSeconds: 400 })).toBe(0);
  });

  it("IV-7: the clock reads as minutes and padded seconds", () => {
    expect(formatClock(300)).toBe("5:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("where a resumed Attempt picks up (ticket 04)", () => {
  it("IV-8: the next question is the first with no Answer, in order, whatever order the rows arrive in", () => {
    const shuffled = [
      question(2, "stakeholder"),
      question(0, "personal", {}),
      question(1, "behavioural"),
    ];

    expect(nextQuestion(attempt(shuffled))?.order).toBe(1);
  });

  it("IV-9: a question left mid-answer carries no Answer at all, so returning resumes on it, never inside it", () => {
    // The Tenant navigated away while answering question 1: nothing was recorded for it.
    const interrupted = attempt([question(0, "personal", {}), question(1, "behavioural"), question(2, "stakeholder")]);

    expect(nextQuestion(interrupted)?.order).toBe(1);
    expect(interrupted.questions[1].answer).toBeUndefined();
    expect(isComplete(interrupted)).toBe(false);
  });

  it("IV-10: an Attempt is complete when every question has an Answer, and an empty one is never complete", () => {
    expect(isComplete(attempt([question(0, "personal", {}), question(1, "design", {})]))).toBe(true);
    expect(nextQuestion(attempt([question(0, "personal", {})]))).toBeUndefined();
    expect(isComplete(attempt([]))).toBe(false);
  });

  it("IV-11: an Attempt is scored once it carries an overall score", () => {
    expect(isScored({ overallScore: null })).toBe(false);
    expect(isScored({ overallScore: 0 })).toBe(true);
    expect(isScored({ overallScore: 71 })).toBe(true);
  });
});

describe("the Scorecard's rollups (ticket 03)", () => {
  it("IV-12: each Category is its own questions' average, and overall is the average across every answered question", () => {
    const scorecard = rollUp([
      question(0, "personal", { score: 80 }),
      question(1, "technical", { score: 40 }),
      question(2, "technical", { score: 60 }),
      question(3, "technical", { score: 50 }),
    ]);

    expect(scorecard.categories).toEqual([
      { category: "personal", score: 80, questions: 1, unreached: 0 },
      { category: "technical", score: 50, questions: 3, unreached: 0 },
    ]);
    // Not the average of the two Category averages (65) — that would weigh one question as heavily
    // as three.
    expect(scorecard.overall).toBe(58);
  });

  it("IV-13: a Category is listed in the fixed Category order, and an answered question not yet scored counts for nothing", () => {
    const scorecard = rollUp([
      question(0, "design", { score: 90 }),
      question(1, "personal", { score: 70 }),
      question(2, "stakeholder", { score: null }),
    ]);

    expect(scorecard.categories.map((category) => category.category)).toEqual(["personal", "design"]);
    expect(scorecard.overall).toBe(80);
  });

  it("IV-14: an empty Attempt rolls up to zero rather than to NaN", () => {
    expect(rollUp([])).toEqual({ overall: 0, categories: [] });
  });
});

describe("unreached questions (interview second pass ticket 03)", () => {
  it("IV-14b: an unreached question counts as nothing at half weight — five questions, three answered at 80, two unreached, is 60", () => {
    const scorecard = rollUp([
      question(0, "personal", { score: 80 }),
      question(1, "behavioural", { score: 80 }),
      question(2, "stakeholder", { score: 80 }),
      question(3, "technical"),
      question(4, "design"),
    ]);

    // At full weight it would be 48: running out of time costs something, but not as much as answering badly.
    expect(scorecard.overall).toBe(60);
  });

  it("IV-14c: Category rollups use the same rule, and say how many of their questions were unreached", () => {
    const scorecard = rollUp([
      question(0, "technical", { score: 90 }),
      question(1, "technical"),
      question(2, "design"),
      question(3, "design"),
    ]);

    expect(scorecard.categories).toEqual([
      // 90 at full weight, 0 at half: 90 / 1.5.
      { category: "technical", score: 60, questions: 2, unreached: 1 },
      { category: "design", score: 0, questions: 2, unreached: 2 },
    ]);
    // 90 / (1 + 0.5 × 3)
    expect(scorecard.overall).toBe(36);
  });

  it("IV-14d: with every question unreached the rollup is zero; with none unreached it is a plain average", () => {
    expect(rollUp([question(0, "personal"), question(1, "design")])).toEqual({
      overall: 0,
      categories: [
        { category: "personal", score: 0, questions: 1, unreached: 1 },
        { category: "design", score: 0, questions: 1, unreached: 1 },
      ],
    });
    expect(rollUp([question(0, "personal", { score: 70 }), question(1, "personal", { score: 51 })]).overall).toBe(61);
  });

  it("IV-14e: a question reached and left empty is an Answer, scored at full weight like any other", () => {
    const scorecard = rollUp([
      question(0, "personal", { score: 80 }),
      question(1, "design", { transcript: "", score: 0 }),
    ]);

    expect(scorecard.overall).toBe(40);
    expect(scorecard.categories[1]).toEqual({ category: "design", score: 0, questions: 1, unreached: 0 });
  });

  it("IV-14f: a question is unreached exactly when it has no Answer recorded", () => {
    expect(isUnreached(question(0, "personal"))).toBe(true);
    expect(isUnreached(question(0, "personal", { transcript: "" }))).toBe(false);
    expect(isUnreached(question(0, "personal", { score: 70 }))).toBe(false);
  });
});

describe("how a score reads", () => {
  it("IV-15: a score reads as a band, so the Scorecard is words as well as stars", () => {
    expect([100, 80].map(scoreBand)).toEqual(["strong", "strong"]);
    expect([79, 60].map(scoreBand)).toEqual(["solid", "solid"]);
    expect([59, 40].map(scoreBand)).toEqual(["developing", "developing"]);
    expect([39, 0].map(scoreBand)).toEqual(["not-there-yet", "not-there-yet"]);
    expect([100, 60, 40, 0].map((score) => SCORE_BAND_LABEL[scoreBand(score)])).toEqual([
      "Strong",
      "Solid",
      "Developing",
      "Not there yet",
    ]);
  });
});

describe("scores shown as stars (interview second pass ticket 02)", () => {
  it("IV-15b: a score is five stars in half-steps — score ÷ 20, to the nearest half", () => {
    expect(starsFor(0)).toBe(0);
    expect(starsFor(100)).toBe(5);
    expect(starsFor(70)).toBe(3.5);
    // The band boundaries, and either side of them.
    expect([80, 79, 60, 59, 40, 39].map(starsFor)).toEqual([4, 4, 3, 3, 2, 2]);
    // The nearest half, rounding a midpoint up.
    expect([4, 5, 14, 15, 94, 95].map(starsFor)).toEqual([0, 0.5, 0.5, 1, 4.5, 5]);
    // Never off the scale, whatever the column holds.
    expect(starsFor(-20)).toBe(0);
    expect(starsFor(140)).toBe(5);
  });

  it("IV-15c: what assistive technology hears is the stars and the band, never a number out of 100", () => {
    expect(starsLabel(70)).toBe("3½ of 5 stars, solid");
    expect(starsLabel(100)).toBe("5 of 5 stars, strong");
    expect(starsLabel(10)).toBe("½ of 5 stars, not there yet");
    expect(starsLabel(0)).toBe("0 of 5 stars, not there yet");
    expect(starsLabel(40)).toBe("2 of 5 stars, developing");
  });
});

describe("this week's Attempts (ticket 01)", () => {
  it("IV-16: the status says what is used, what is left, and when the week rolls over", () => {
    expect(interviewQuotaStatus(3, "2026-09-14", 10)).toEqual({
      limit: 10,
      used: 3,
      remaining: 7,
      resetsOn: "2026-09-21",
    });
  });

  it("IV-17: a Tenant moved to a smaller Plan never sees a negative count left", () => {
    expect(interviewQuotaStatus(25, "2026-09-14", 10)).toMatchObject({ used: 10, remaining: 0 });
    expect(interviewQuotaStatus(-1, "2026-09-14", 10)).toMatchObject({ used: 0, remaining: 10 });
  });

  it("IV-18: an unlimited Limit leaves the count alone and has nothing left to count down", () => {
    expect(interviewQuotaStatus(40, "2026-09-14", "unlimited")).toEqual({
      limit: "unlimited",
      used: 40,
      remaining: "unlimited",
      resetsOn: "2026-09-21",
    });
  });
});
