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
 * while they are away. There is no pause between questions: each one's clock starts the moment it is
 * on screen, the way a real interviewer moves straight to the next question.
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
  rationale: string;
};

/** How a Tenant answered: spoken aloud (recommended) or typed. Nothing but the text reaches the server. */
export const INPUT_MODES = ["speak", "type"] as const;

export type InputMode = (typeof INPUT_MODES)[number];

/** Why speaking is offered first — shown on the start screen so the default isn't arbitrary. */
export const SPEAK_RECOMMENDED =
  "Speaking is the closer rehearsal: a real interview is answered out loud, under the clock, with no chance to edit. Your browser does the transcribing — no audio is recorded, uploaded, or stored.";

/** What a browser without speech recognition is told, so the fallback isn't a confusing failure. */
export const SPEAK_UNSUPPORTED =
  "This browser can’t transcribe speech, so type your answers here. Chrome and Edge can, if you’d rather rehearse out loud.";

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
  questions: AttemptQuestion[];
};

/** Seconds left on an Attempt's countdown. Never negative. */
export function remainingSeconds(attempt: Pick<Attempt, "length" | "activeSeconds">): number {
  return Math.max(attemptSeconds(attempt.length) - attempt.activeSeconds, 0);
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
export function nextQuestion(attempt: Pick<Attempt, "questions">): AttemptQuestion | undefined {
  return [...attempt.questions].sort((a, b) => a.order - b.order).find((question) => !question.answer);
}

/** Answered every question. */
export function isComplete(attempt: Pick<Attempt, "questions">): boolean {
  return attempt.questions.length > 0 && attempt.questions.every((question) => question.answer);
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

/** A rationale is a sentence or two about one Answer, and the schema says so. */
export const RATIONALE_MAX_CHARS = 400;

/** One Category's part of a Scorecard: its questions' average, and how many it covered. */
export type CategoryScore = { category: Category; score: number; questions: number };

/** What a completed, scored Attempt is worth: per Answer, per Category, and overall. */
export type Scorecard = {
  overall: number;
  categories: CategoryScore[];
};

const average = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/**
 * The Scorecard's rollups, from the Answers' own scores: each Category is the average of its
 * answered questions, and overall is the average across every answered question — not an average of
 * the Category averages, which would weigh a one-question Category as heavily as a four-question one.
 * A Category with no answered question is left out rather than shown as a zero it did not earn.
 */
export function rollUp(questions: AttemptQuestion[]): Scorecard {
  const scored = questions.filter(
    (question): question is AttemptQuestion & { answer: AttemptAnswer & { score: number } } =>
      typeof question.answer?.score === "number",
  );
  const categories = CATEGORIES.flatMap((category) => {
    const inCategory = scored.filter((question) => question.category === category);
    if (inCategory.length === 0) return [];
    return [{ category, score: average(inCategory.map((q) => q.answer.score)), questions: inCategory.length }];
  });
  return { overall: scored.length === 0 ? 0 : average(scored.map((q) => q.answer.score)), categories };
}

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

/** What the score route returns: the Attempt with every Answer scored, and its Scorecard. */
export type ScoreAttemptResponse =
  | { ok: true; attempt: Attempt; scorecard: Scorecard }
  | InterviewError;
