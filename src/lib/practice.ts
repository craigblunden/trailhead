import {
  ANSWER_MINUTES,
  canStartAttempt,
  type Category,
  type RunQuestion,
  type TimedRun,
} from "@/lib/interview";
import type { Plan } from "@/lib/plans";

/**
 * A **Practice round** (`CONTEXT.md`), the parts both sides of the boundary share (practice round
 * tickets 03–05). Pure.
 *
 * A short, general run of the Interview Simulator for a Tenant whose Plan cannot start an Attempt:
 * four questions from a fixed set written for any role, answered against the clock exactly as an
 * Attempt is, and kept — but never scored. It belongs to no Job, and no Limit counts it: starting one
 * calls no model, so it costs nothing. It is not a kind of Attempt, and is stored apart from one
 * (ADR-0006); what the two share is the run screen and the timing rules over `TimedRun`.
 */

/** The Categories a Practice round asks, and how many of each, in the order they are asked. */
export const PRACTICE_MIX = { personal: 2, behavioural: 2 } as const satisfies Partial<Record<Category, number>>;

export type PracticeCategory = keyof typeof PRACTICE_MIX;

/**
 * The fixed question set, approved by the owner on 2026-09-17. Questions that suit any role: nothing
 * here may assume a posting or a resume, because a Practice round has neither.
 */
export const PRACTICE_QUESTIONS: Record<PracticeCategory, readonly string[]> = {
  personal: [
    "Walk me through your background and what has led you to where you are now.",
    "What are you looking for in your next role that you don’t have in your current or most recent one?",
    "What kind of work gives you the most energy, and what kind drains it?",
    "How would the people you’ve worked most closely with describe you?",
    "What’s something you’ve taught yourself recently, and how did you go about it?",
    "Where do you want your career to be in a few years, and how does your next role fit into that?",
  ],
  behavioural: [
    "Tell me about a time a plan you were responsible for fell apart. What did you do?",
    "Describe a time you disagreed with someone you worked with about how to do something. How was it resolved?",
    "Tell me about a mistake you made at work — how you found out, and what you changed afterwards.",
    "Give me an example of a time you had more to do than you could get done. How did you decide what came first?",
    "Tell me about a time you had to learn something unfamiliar quickly to deliver on a commitment.",
    "Describe a piece of work you’re proud of, and the part you personally played in it.",
  ],
};

/** How many questions a Practice round asks in all. */
export const PRACTICE_QUESTION_COUNT = Object.values(PRACTICE_MIX).reduce((total, count) => total + count, 0);

/** A Practice round's whole countdown, in seconds: its questions' answer times added up. */
export const PRACTICE_SECONDS = (Object.entries(PRACTICE_MIX) as [PracticeCategory, number][]).reduce(
  (total, [category, count]) => total + count * ANSWER_MINUTES[category] * 60,
  0,
);

/** What a round is, in the words the hub's offer and the set-up both use. */
export const PRACTICE_SUMMARY = `${PRACTICE_QUESTION_COUNT} general questions · ${PRACTICE_SECONDS / 60} minutes · not scored`;

/** A question picked for a round, before it is stored. */
export type PickedQuestion = { category: PracticeCategory; text: string };

/**
 * A round's questions: two personal, then two behavioural, drawn at random from the fixed set —
 * preferring questions the Tenant's previous round did not ask, and topping up from those only when
 * too few new ones are left. `random` is replaceable so a pick can be tested exactly.
 */
export function pickPracticeQuestions(previous: readonly string[], random: () => number = Math.random): PickedQuestion[] {
  const asked = new Set(previous);
  return (Object.entries(PRACTICE_MIX) as [PracticeCategory, number][]).flatMap(([category, count]) => {
    const fresh = PRACTICE_QUESTIONS[category].filter((text) => !asked.has(text));
    const stale = PRACTICE_QUESTIONS[category].filter((text) => asked.has(text));
    return Array.from({ length: count }, () => {
      const pool = fresh.length > 0 ? fresh : stale;
      const [text] = pool.splice(Math.min(Math.floor(random() * pool.length), pool.length - 1), 1);
      return { category, text };
    });
  });
}

/**
 * Whether a Plan may start a Practice round: exactly the Plans that cannot start an Attempt. A Tenant
 * with the full Simulator has no use for the taste of it.
 */
export function canStartPracticeRound(plan: Plan): boolean {
  return !canStartAttempt(plan);
}

/** A Practice round's question, as persisted: its text is stored, so editing the set never rewrites a round. */
export type PracticeQuestion = RunQuestion & { category: PracticeCategory };

/** A Practice round, as the page holds it: a timed run, with when it started and whether it has ended. */
export type PracticeRound = TimedRun<PracticeQuestion> & {
  /** ISO timestamp: when it was started. */
  startedAt: string;
  /** Set once every question has a recorded Answer, or the countdown ran out. */
  completedAt: string | null;
};

/** Every way a Practice round request can end without what was asked for, in the words the page shows. */
export const PRACTICE_FAILURES = {
  "has-simulator": "Your plan has the full Interview Simulator, so there’s no practice round to take — rehearse for a job instead.",
  "in-progress": "You already have a practice round in progress. Resume it, or start over.",
  "no-round": "That practice round has already finished, or was never started.",
  "bad-answer": "That answer couldn’t be read. Keep it to plain text and try again.",
  failed: "Something went wrong on our side. Try again in a minute.",
} as const;

export type PracticeFailure = keyof typeof PRACTICE_FAILURES;

/** What the start route accepts: true to discard an unfinished round and start a fresh one. */
export type StartPracticeRequest = { reset: boolean };

type PracticeError = {
  ok: false;
  error: PracticeFailure | "unauthenticated" | "not-found";
  message: string;
  /** The unfinished round an `in-progress` refusal is about, so the page can offer to resume it. */
  round?: PracticeRound;
};

/** What the start route and the record-Answer route return: the round as it now stands. */
export type PracticeRoundResponse = { ok: true; round: PracticeRound } | PracticeError;
