import { nextWeekStart } from "@/lib/dates";
import type { Job } from "@/lib/jobs";
import type { Limit, Plan } from "@/lib/plans";

/**
 * The Interview Simulator, the parts both sides of the boundary share (interview simulator tickets
 * 01–08). Pure.
 *
 * An **Attempt** is one timed run against one Job: a question set spanning all five **Categories**,
 * an **Answer** per question, and a **Scorecard** once scored (`CONTEXT.md`). Attempts are counted
 * against a weekly Limit of their own — a separate counter from cover letters, so neither feature's
 * quota can be spent by the other, and so the cover-letter Flag/Hold semantics are not implied here.
 *
 * The timing model is **active-time accounted, not wall-clock**: an Attempt carries the seconds it
 * has actually been answered for, so a Tenant who closes the tab does not watch their budget drain
 * while they are away. There is no pause between questions: each one's clock starts the moment it has
 * been asked — on screen, or read aloud when answering by speaking — the way a real interviewer moves
 * straight to the next question.
 */

/** The five fixed dimensions an Attempt's questions are drawn from. Every Attempt spans all five. */
export const CATEGORIES = ["personal", "behavioural", "stakeholder", "technical", "design"] as const;

export type Category = (typeof CATEGORIES)[number];

/** How a Category is named wherever it is shown. */
export const CATEGORY_LABEL: Record<Category, string> = {
  personal: "Personal",
  behavioural: "Behavioural",
  stakeholder: "Stakeholder",
  technical: "Technical",
  design: "Design",
};

/** What each Category is for, shown on the start screen so the breakdown explains itself. */
export const CATEGORY_BLURB: Record<Category, string> = {
  personal: "Who you are, what you want, and why this role.",
  behavioural: "How you have actually handled work that went sideways.",
  stakeholder: "Working with the people around the work.",
  technical: "The craft the posting asks for, at the depth it asks for it.",
  design: "How you think a problem through from scratch.",
};

/**
 * Each Category's **answer time**, in minutes: how long one of its Answers is meant to take
 * (interview second pass ticket 04). A guide the Tenant is shown under each question and the question
 * writer and scorer are told — never a cut-off: the countdown is still one for the whole Attempt.
 */
export const ANSWER_MINUTES: Record<Category, number> = {
  personal: 1.5,
  behavioural: 2.5,
  stakeholder: 2,
  technical: 3,
  design: 4,
};

/** "1½", "3": minutes as they read beside a question, in whole and half minutes. */
export function formatMinutes(minutes: number): string {
  const whole = Math.floor(minutes);
  return minutes === whole ? String(whole) : `${whole === 0 ? "" : whole}½`;
}

/** The lengths an Attempt can be started at, in minutes. */
export const ATTEMPT_LENGTHS = [15, 20, 30] as const;

export type AttemptLength = (typeof ATTEMPT_LENGTHS)[number];

/**
 * Lengths offered before the second pass. No Attempt can be started at one any more, but one started
 * before still resumes on its own countdown and question set, scores, and shows its length.
 */
export const RETIRED_LENGTHS = [5, 10] as const;

/** Any length an Attempt may carry: one offered now, or one it was started at before. */
export type KnownLength = AttemptLength | (typeof RETIRED_LENGTHS)[number];

export function isAttemptLength(value: unknown): value is AttemptLength {
  return ATTEMPT_LENGTHS.includes(value as AttemptLength);
}

export function isKnownLength(value: unknown): value is KnownLength {
  return isAttemptLength(value) || RETIRED_LENGTHS.includes(value as (typeof RETIRED_LENGTHS)[number]);
}

/**
 * How many questions each Category contributes at each length (spec's table). Every Attempt spans
 * all five Categories regardless of length, so the shortest rehearsal is balanced rather than skewed
 * to one dimension. The mixes are built from the answer times: technical and design questions take
 * longest to answer, so the longer lengths ask fewer of them than their share of the clock suggests.
 */
export const CATEGORY_MIX: Record<AttemptLength, Record<Category, number>> = {
  15: { personal: 1, behavioural: 1, stakeholder: 1, technical: 1, design: 1 },
  20: { personal: 2, behavioural: 2, stakeholder: 2, technical: 1, design: 1 },
  30: { personal: 2, behavioural: 3, stakeholder: 3, technical: 2, design: 2 },
};

/** How many questions an Attempt of this length asks in all. */
export function questionCount(length: AttemptLength): number {
  return CATEGORIES.reduce((total, category) => total + CATEGORY_MIX[length][category], 0);
}

/** The Attempt's total countdown, in seconds. One countdown for the whole Attempt, never per question. */
export function attemptSeconds(length: KnownLength): number {
  return length * 60;
}

/** A question as it was generated and persisted: never regenerated, so a resumed Attempt is identical. */
export type AttemptQuestion = {
  id: string;
  category: Category;
  /** Position in the Attempt, from 0. The order questions are asked in. */
  order: number;
  text: string;
  /** The Answer recorded for it, if any. Absent while the question is still unanswered. */
  answer?: AttemptAnswer;
};

/** The response captured for one question — spoken or typed, the same field either way. */
export type AttemptAnswer = {
  transcript: string;
  /** Set once the Attempt has been scored. */
  score: number | null;
  /**
   * What landed in the Answer, in one sentence (interview second pass ticket 05). Empty on an Answer
   * scored before then, which carries its single `rationale` instead.
   */
  whatLanded: string;
  /** One to three **Missed points**: specific things from the posting or resume the Answer could have said. */
  missedPoints: string[];
  /** The one rationale an Answer scored before What landed and Missed points carries. Empty since. */
  rationale: string;
};

/**
 * One point of a **Takeaway** (interview second pass ticket 05): something worth changing next time,
 * and what across the Attempt's Answers it is drawn from.
 */
export type TakeawayPoint = { point: string; from: string };

/**
 * How answers are given, said on every set-up. Answers are spoken only (practice feedback ticket 02): a
 * choice between typing and speaking confused first-time users more than it helped. Nothing but the text
 * the browser heard reaches the server.
 */
export const SPOKEN_ANSWERS =
  "You answer out loud, as you would in the room. Your browser does the transcribing — no audio is recorded, uploaded, or stored.";

/** What a browser without speech recognition is told in place of Go or Resume. */
export const SPEAK_UNSUPPORTED =
  "This browser can’t hear your answers. Open this page in Chrome, Edge, or Safari to rehearse out loud.";

/** An Attempt in flight, as the page holds it. */
export type Attempt = {
  id: string;
  jobId: string;
  /** Minutes. A retired length on an Attempt started before the lengths changed. */
  length: KnownLength;
  /** Seconds this Attempt has actually been answered for. Not wall-clock time since it started. */
  activeSeconds: number;
  /** Set once every question has a recorded Answer, or the countdown ran out. */
  completedAt: string | null;
  /** The Scorecard's overall score, once scored. */
  overallScore: number | null;
  /** The two or three things most worth changing, once scored. Empty on an Attempt scored before there were any. */
  takeaway: TakeawayPoint[];
  questions: AttemptQuestion[];
};

/** A question as a timed run reads it: where it sits, what it asks, and its Answer's words if it has one. */
export type RunQuestion = Pick<AttemptQuestion, "id" | "category" | "order" | "text"> & {
  answer?: Pick<AttemptAnswer, "transcript">;
};

/**
 * What the run screen and the countdown read of any timed run — an Attempt or a Practice round
 * (practice round ticket 01): ordered questions that may carry an Answer, one countdown in seconds, and
 * the seconds already answered for. Nothing here names a Job, a length, or a score.
 */
export type TimedRun<Q extends RunQuestion = RunQuestion> = {
  id: string;
  /** The whole countdown, in seconds. One for the whole run, never per question. */
  countdownSeconds: number;
  /** Seconds this run has actually been answered for. Not wall-clock time since it started. */
  activeSeconds: number;
  questions: Q[];
};

/** An Attempt as a timed run: its countdown is its length. */
export function attemptRun(attempt: Attempt): TimedRun<AttemptQuestion> {
  return {
    id: attempt.id,
    countdownSeconds: attemptSeconds(attempt.length),
    activeSeconds: attempt.activeSeconds,
    questions: attempt.questions,
  };
}

/** Seconds left on a timed run's countdown. Never negative. */
export function secondsLeft(run: Pick<TimedRun, "countdownSeconds" | "activeSeconds">): number {
  return Math.max(run.countdownSeconds - run.activeSeconds, 0);
}

/** Seconds left on an Attempt's countdown. Never negative. */
export function remainingSeconds(attempt: Pick<Attempt, "length" | "activeSeconds">): number {
  return secondsLeft({ countdownSeconds: attemptSeconds(attempt.length), activeSeconds: attempt.activeSeconds });
}

/** "12:05" — the countdown as it reads on the page. */
export function formatClock(seconds: number): string {
  const whole = Math.max(Math.floor(seconds), 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The next question to answer: the first with no Answer recorded. Undefined when every question has
 * one — the Attempt is complete. A question left half-answered when the Tenant navigated away has no
 * Answer recorded at all, so returning resumes on it or the one after it, never inside it.
 */
export function nextQuestion<Q extends Pick<RunQuestion, "order" | "answer">>(run: { questions: Q[] }): Q | undefined {
  return [...run.questions].sort((a, b) => a.order - b.order).find((question) => !question.answer);
}

/** Answered every question. */
export function isComplete(run: { questions: Pick<RunQuestion, "answer">[] }): boolean {
  return run.questions.length > 0 && run.questions.every((question) => question.answer);
}

/** An Attempt that has been scored carries an overall score and a rationale on every Answer. */
export function isScored(attempt: Pick<Attempt, "overallScore">): boolean {
  return attempt.overallScore !== null;
}

/** Scores run 0–100, so "overall" reads as a mark rather than a number needing a scale beside it. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** An Answer's transcript is bounded like every other free text crossing the boundary. */
export const TRANSCRIPT_MAX_CHARS = 6_000;

/** What landed is one sentence about one Answer, and the schema says so. */
export const WHAT_LANDED_MAX_CHARS = 300;

/** A Missed point is one specific thing, a sentence at most. */
export const MISSED_POINT_MAX_CHARS = 240;

/** How many Missed points one Answer carries: at least one, so there is always something to reach for. */
export const MISSED_POINTS_MIN = 1;
export const MISSED_POINTS_MAX = 3;

/** A Takeaway point, and what it is drawn from, are each a sentence at most. */
export const TAKEAWAY_POINT_MAX_CHARS = 300;
export const TAKEAWAY_FROM_MAX_CHARS = 160;

/** A Takeaway is two or three points: fewer is not a pattern, more is not a priority. */
export const TAKEAWAY_MIN = 2;
export const TAKEAWAY_MAX = 3;

/**
 * One Category's part of a Scorecard: its questions' weighted average, how many it covered, and how
 * many of those the countdown ran out before — all of them, and the Category reads "Not reached".
 */
export type CategoryScore = { category: Category; score: number; questions: number; unreached: number };

/** What a completed, scored Attempt is worth: per Answer, per Category, and overall. */
export type Scorecard = {
  overall: number;
  categories: CategoryScore[];
};

/**
 * An **Unreached question** (interview second pass ticket 03): the countdown ran out before the Tenant
 * got to it, or with nothing yet said on it, so no Answer was recorded. Distinct from a question
 * reached and left empty, which is an Answer and scored like any other.
 */
export function isUnreached(question: { answer?: unknown }): boolean {
  return !question.answer;
}

/** All a rollup reads of a question: its Category, and its Answer's score if one was recorded. */
export type RollUpQuestion = Pick<AttemptQuestion, "category"> & { answer?: Pick<AttemptAnswer, "score"> };

/**
 * How much an unreached question weighs in a rollup, against an Answer's 1. Being cut off costs
 * something, but not as much as answering badly: five questions, three answered at 80 and two
 * unreached, is 60 rather than the 48 full weight would make it.
 */
export const UNREACHED_WEIGHT = 0.5;

/**
 * The Scorecard's rollups, from the Answers' own scores: each Category is the weighted average of its
 * questions, and overall is the weighted average across every question — not an average of the
 * Category averages, which would weigh a one-question Category as heavily as a four-question one.
 * A scored Answer weighs 1; an unreached question counts as 0 at `UNREACHED_WEIGHT`. An Answer not yet
 * scored counts for nothing, and a Category with nothing to count is left out.
 *
 * Derived on read, never trusted from storage, so an Attempt scored before unreached questions were
 * weighted this way reads under the same rule (its unreached questions carry no Answer).
 */
export function rollUp(questions: RollUpQuestion[]): Scorecard {
  const counted = questions.flatMap((question) => {
    if (isUnreached(question)) return [{ question, score: 0, weight: UNREACHED_WEIGHT }];
    const score = question.answer?.score;
    return typeof score === "number" ? [{ question, score, weight: 1 }] : [];
  });
  const weighted = (items: typeof counted) => {
    const weight = items.reduce((sum, item) => sum + item.weight, 0);
    return weight === 0 ? 0 : Math.round(items.reduce((sum, item) => sum + item.score * item.weight, 0) / weight);
  };
  const categories = CATEGORIES.flatMap((category) => {
    const inCategory = counted.filter((item) => item.question.category === category);
    if (inCategory.length === 0) return [];
    return [
      {
        category,
        score: weighted(inCategory),
        questions: inCategory.length,
        unreached: inCategory.filter((item) => isUnreached(item.question)).length,
      },
    ];
  });
  return { overall: weighted(counted), categories };
}

/**
 * One row of the hub's past interviews (interview second pass ticket 06): a scored Attempt, or the one
 * in progress for a Job. Reset Attempts and finished ones never scored are not past interviews.
 */
export type PastAttempt = {
  id: string;
  jobId: string;
  company: string;
  role: string;
  accent: Job["accent"];
  /** ISO `YYYY-MM-DD`, UTC: the day it was started. */
  startedOn: string;
  length: KnownLength;
  status: "scored" | "in-progress";
  /** The overall score, derived from the Answers under today's rollup; null while in progress. */
  overall: number | null;
};

/** Where a score sits, so the Scorecard reads as words and not only stars. */
export type ScoreBand = "strong" | "solid" | "developing" | "not-there-yet";

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "solid";
  if (score >= 40) return "developing";
  return "not-there-yet";
}

/**
 * The band's word, always shown beside the stars (interview second pass ticket 02). The lowest is
 * "Not there yet": not "Weak", a verdict on the Tenant, and not "Needs work", which App feedback's
 * rating already uses.
 */
export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  strong: "Strong",
  solid: "Solid",
  developing: "Developing",
  "not-there-yet": "Not there yet",
};

/** How each band is coloured wherever a score is shown: strong in the brand colour, the lowest as a warning. */
export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  strong: "text-primary",
  solid: "text-foreground",
  developing: "text-muted-foreground",
  "not-there-yet": "text-destructive",
};

/** How many stars a score is shown as. */
export const STARS_MAX = 5;

/**
 * A 0–100 score as stars in half-steps: score ÷ 20, to the nearest half. Scores are still stored and
 * returned as 0–100; only how they read changes.
 */
export function starsFor(score: number): number {
  const clamped = Math.min(Math.max(score, SCORE_MIN), SCORE_MAX);
  return Math.round((clamped / SCORE_MAX) * STARS_MAX * 2) / 2;
}

/** "3½ of 5 stars, solid": what assistive technology hears in place of the stars themselves. */
export function starsLabel(score: number): string {
  const stars = starsFor(score);
  const whole = Math.floor(stars);
  const amount = stars === whole ? String(whole) : `${whole === 0 ? "" : whole}½`;
  return `${amount} of ${STARS_MAX} stars, ${SCORE_BAND_LABEL[scoreBand(score)].toLowerCase()}`;
}

/**
 * The Plan the Interview Simulator actually runs on this phase. Free and Basic see the same screens
 * as a locked preview (interview simulator ticket 08), and the start route refuses them.
 *
 * Deliberately a Plan check rather than ADR-0003's shape — a Limit of 0 gating the feature — because
 * their real Limits are already recorded in `PLAN_LIMITS` (1 and 3 Attempts a week) and a 0 would
 * state something untrue about what those Plans are meant to get. **ADR-0005** records the departure
 * and what ends it: when entitlements land, this predicate goes and the reservation's Limit is the
 * whole gate.
 */
export const INTERVIEW_PLAN: Plan = "pro";

/** Whether a Plan may start a real Attempt, as opposed to seeing the locked preview. */
export function canStartAttempt(plan: Plan): boolean {
  return plan === INTERVIEW_PLAN;
}

/**
 * Whether questions can be written for a Job yet — the same two things the server refuses a start
 * for (`no-resume`, `no-description`), read from the Job the page already holds. The picker says so
 * on each row, so a Tenant learns a job isn't ready before choosing it rather than at Go.
 */
export type Readiness = "ready" | "no-resume" | "no-description";

export function readinessOf(job: Pick<Job, "resume" | "description">): Readiness {
  if (!job.resume) return "no-resume";
  if (!job.description.trim()) return "no-description";
  return "ready";
}

/** A not-ready Job's short label in the picker. The full reason is `INTERVIEW_FAILURES[readiness]`. */
export const NOT_READY_LABEL: Record<Exclude<Readiness, "ready">, string> = {
  "no-resume": "Needs a resume",
  "no-description": "Needs the posting",
};

/** This week's Attempts, as the start screen shows them before the Tenant spends one. */
export type InterviewQuotaStatus = {
  /** The Tenant's Attempts-per-week Limit. */
  limit: Limit;
  used: number;
  /** Attempts left this week; "unlimited" under an unlimited Limit. */
  remaining: Limit;
  /** ISO `YYYY-MM-DD`: the Monday (UTC) the next window opens. */
  resetsOn: string;
};

export function interviewQuotaStatus(used: number, weekStart: string, limit: Limit): InterviewQuotaStatus {
  const resetsOn = nextWeekStart(weekStart);
  if (limit === "unlimited") return { limit, used: Math.max(used, 0), remaining: "unlimited", resetsOn };
  // A Tenant moved to a smaller Plan can hold a count above its Limit; the status never shows a
  // negative "left".
  const clamped = Math.min(Math.max(used, 0), limit);
  return { limit, used: clamped, remaining: limit - clamped, resetsOn };
}

/**
 * Every way an interview request can end without what was asked for, as codes the routes return and
 * the UI explains. Each message says what happened and what the Tenant can do about it.
 */
export const INTERVIEW_FAILURES = {
  refused:
    "Claude declined to prepare this interview. That usually means something in the job description or resume was read as a request it won’t help with. Check the description is the posting itself, then try again.",
  failed: "The interview service had a problem. It’s usually brief — try again in a minute.",
  "timed-out": "Preparing the interview took longer than it should, so we stopped waiting. Try again.",
  truncated: "The interview came back unfinished. Try again.",
  unavailable: "The interview simulator isn’t available on this deployment yet.",
  quota: "You’ve used this week’s interviews.",
  "not-pro": "The interview simulator is a Pro feature.",
  "bad-length": "That interview length isn’t available on your plan.",
  "no-resume": "Attach a resume in this job’s application kit first — the questions are drawn from it.",
  "no-description":
    "Paste the job posting into this job’s description first — the questions are drawn from it.",
  "in-progress":
    "You already have an interview in progress for this job. Resume it, or reset it to start fresh.",
  "no-attempt": "That interview has already finished, or was never started.",
  incomplete: "Answer every question before scoring this interview.",
  "bad-answer": "That answer couldn’t be read. Keep it to plain text and try again.",
  rescored:
    "This interview has been scored as many times as it can be. Its scorecard is still here — rehearse again for a fresh one.",
} as const;

export type InterviewFailure = keyof typeof INTERVIEW_FAILURES;

/**
 * Failures that give the reserved Attempt back: ours and Anthropic's. A refusal stays counted, for
 * the same reason a refused letter does — refunding it would make probing for one free.
 */
export const REFUNDED_INTERVIEW_FAILURES: readonly InterviewFailure[] = ["failed", "timed-out", "truncated"];

/** What the start route accepts as its JSON body. */
export type StartAttemptRequest = {
  length: AttemptLength;
  /**
   * True to abandon an unfinished Attempt for this Job and spend another of the week's on a fresh
   * one. False — the default — resumes rather than replaces, so a start request can never silently
   * cost a Tenant an Attempt they still had in progress.
   */
  reset: boolean;
};

/** What the record-Answer route accepts as its JSON body. */
export type RecordAnswerRequest = {
  questionId: string;
  transcript: string;
  /** Seconds of the countdown this answer consumed. Added to the Attempt's active time. */
  elapsedSeconds: number;
};

/**
 * What the record-Answer route accepts when the countdown runs out mid-answer: the question on
 * screen and what had been said on it so far, kept as its Answer (interview second pass ticket 03).
 */
export type TimeUpRequest = {
  timeUp: true;
  questionId: string;
  transcript: string;
};

type InterviewError = {
  ok: false;
  error: InterviewFailure | "unauthenticated" | "not-found";
  message: string;
  quota?: InterviewQuotaStatus;
  /** True only when an Attempt was reserved and then given back. */
  refunded?: boolean;
  /**
   * The unfinished Attempt an `in-progress` refusal is about, so the page can offer to resume it
   * without a second round trip. Absent on every other failure.
   */
  attempt?: Attempt;
};

/** What the start route returns. */
export type StartAttemptResponse = { ok: true; attempt: Attempt; quota?: InterviewQuotaStatus } | InterviewError;

/** What the record-Answer route returns: the Attempt as it now stands. */
export type RecordAnswerResponse = { ok: true; attempt: Attempt } | InterviewError;

/**
 * How many scored Attempts, across all Jobs, before the Scorecard asks once how the Simulator is going
 * (interview second pass ticket 08): enough to have an opinion, early enough to still shape it.
 */
export const ASK_FOR_FEEDBACK_AT = 2;

/**
 * How many times one Attempt may be scored successfully. Scoring spends no quota — the Attempt was
 * counted when it was started — so without this the score route is an unbounded model call behind a
 * session, and the only one in this application.
 *
 * Three, not one: a scoring the Tenant never saw the result of (a dropped connection, a closed tab
 * between the model answering and the response landing) has still been counted, and they should be
 * able to ask again. A failed scoring is given back and does not count at all, so this bounds
 * repetition rather than retries. Nothing in the UI re-scores on its own: a past Scorecard is read
 * from storage.
 */
export const MAX_SCORE_RUNS = 3;

/**
 * What the score route returns: the Attempt with every Answer scored, and its Scorecard. `askForFeedback`
 * is true only in the response to the scoring that made this the Tenant's second scored Attempt —
 * never on a re-score, never on a reload — so the ask is shown once and nothing is stored to remember it.
 */
export type ScoreAttemptResponse =
  | { ok: true; attempt: Attempt; scorecard: Scorecard; askForFeedback: boolean }
  | InterviewError;
