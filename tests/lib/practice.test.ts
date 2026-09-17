import { describe, expect, it } from "vitest";

import { ANSWER_MINUTES } from "@/lib/interview";
import {
  PRACTICE_QUESTIONS,
  PRACTICE_SECONDS,
  canStartPracticeRound,
  pickPracticeQuestions,
} from "@/lib/practice";

/**
 * A Practice round's pure rules (practice round ticket 03): the fixed question set, how a round's four
 * questions are picked from it, its countdown, and who may start one.
 */

/** A "random" source that walks a fixed sequence, so a pick can be asserted exactly. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe("the fixed question set (practice round ticket 03)", () => {
  it("PR-1: six personal and six behavioural questions, as the owner approved them", () => {
    expect(PRACTICE_QUESTIONS.personal).toHaveLength(6);
    expect(PRACTICE_QUESTIONS.behavioural).toHaveLength(6);
    expect(PRACTICE_QUESTIONS.personal[0]).toBe(
      "Walk me through your background and what has led you to where you are now.",
    );
    expect(PRACTICE_QUESTIONS.behavioural[0]).toBe(
      "Tell me about a time a plan you were responsible for fell apart. What did you do?",
    );
  });

  it("PR-2: a round is two personal questions, then two behavioural, all different", () => {
    const picked = pickPracticeQuestions([]);

    expect(picked.map((question) => question.category)).toEqual(["personal", "personal", "behavioural", "behavioural"]);
    expect(new Set(picked.map((question) => question.text)).size).toBe(4);
    for (const question of picked) expect(PRACTICE_QUESTIONS[question.category]).toContain(question.text);
  });

  it("PR-3: a round prefers questions the previous round did not ask", () => {
    const previous = [
      PRACTICE_QUESTIONS.personal[0],
      PRACTICE_QUESTIONS.personal[1],
      PRACTICE_QUESTIONS.behavioural[0],
      PRACTICE_QUESTIONS.behavioural[1],
    ];

    for (let run = 0; run < 25; run += 1) {
      const picked = pickPracticeQuestions(previous).map((question) => question.text);
      expect(picked.some((text) => previous.includes(text))).toBe(false);
    }
  });

  it("PR-4: where too few new questions are left, it tops up from the ones asked before", () => {
    const previous = PRACTICE_QUESTIONS.personal.slice(0, 5);

    const personal = pickPracticeQuestions(previous, sequence(0)).filter((question) => question.category === "personal");

    expect(personal.map((question) => question.text)).toEqual([PRACTICE_QUESTIONS.personal[5], PRACTICE_QUESTIONS.personal[0]]);
  });
});

describe("a round's countdown and who may take one (practice round ticket 03)", () => {
  it("PR-5: the countdown is the four questions' answer times added up — eight minutes", () => {
    expect(PRACTICE_SECONDS).toBe((2 * ANSWER_MINUTES.personal + 2 * ANSWER_MINUTES.behavioural) * 60);
    expect(PRACTICE_SECONDS).toBe(480);
  });

  it("PR-6: free and basic may start a Practice round; pro, which has the full Simulator, may not", () => {
    expect(canStartPracticeRound("free")).toBe(true);
    expect(canStartPracticeRound("basic")).toBe(true);
    expect(canStartPracticeRound("pro")).toBe(false);
  });
});
