import { NextResponse } from "next/server";

import {
  INTERVIEW_FAILURES,
  type InterviewFailure,
  type RecordAnswerResponse,
  type ScoreAttemptResponse,
  type StartAttemptResponse,
} from "@/lib/interview";
import { PRACTICE_FAILURES, type PracticeFailure, type PracticeRound, type PracticeRoundResponse } from "@/lib/practice";
import { ACTION_MESSAGES } from "@/server/action-result";
import { NotFoundError } from "@/server/data/errors";

/**
 * What the Interview Simulator's Route Handlers — an Attempt's three and a Practice round's two — share: the status each failure means, and the
 * replies a handler makes itself before the orchestration layer is reached. Kept here rather than
 * repeated in each route, so a new failure code gets a status once — and so a handler that forgets
 * one fails the typecheck rather than answering 200.
 *
 * The shape is always the response type the client reads, never a framework error page: the page
 * shows a designed failure state for every outcome, including the ones it did not expect.
 */

export const INTERVIEW_STATUS: Record<InterviewFailure, number> = {
  refused: 422,
  failed: 502,
  "timed-out": 504,
  truncated: 502,
  unavailable: 503,
  quota: 429,
  "not-pro": 403,
  "bad-length": 422,
  "no-resume": 409,
  "no-description": 409,
  "in-progress": 409,
  "no-attempt": 404,
  incomplete: 409,
  "bad-answer": 400,
};

/**
 * Every interview reply is one of the three routes' response types — never a bare object. That is
 * what makes a handler that forgets a field, or invents one, fail the typecheck rather than answer
 * 200 with a shape the page cannot read.
 */
type InterviewResponse = StartAttemptResponse | RecordAnswerResponse | ScoreAttemptResponse;

export const reply = (status: number, body: InterviewResponse) => NextResponse.json(body, { status });

export const unauthenticated = {
  ok: false,
  error: "unauthenticated",
  message: ACTION_MESSAGES.unauthenticated,
} as const;

/** The same words an action uses for a missing or foreign job. */
export const notFound = { ok: false, error: "not-found", message: new NotFoundError().shown } as const;

/** The page's shape for a body the handler cannot read, never a framework page. */
export const badBody = {
  ok: false,
  error: "bad-answer",
  message: INTERVIEW_FAILURES["bad-answer"],
  refunded: false,
} as const;

/** The status each Practice round failure means (practice round ticket 03). */
export const PRACTICE_STATUS: Record<PracticeFailure, number> = {
  "has-simulator": 403,
  "in-progress": 409,
  "no-round": 404,
  "bad-answer": 400,
  failed: 500,
};

/** Every Practice round reply is its response type, for the same reason every interview reply is. */
export const practiceReply = (status: number, body: PracticeRoundResponse) => NextResponse.json(body, { status });

/** A Practice round refusal in the page's shape, with the words it is shown in. */
export const practiceFailure = (reason: PracticeFailure, round?: PracticeRound) =>
  practiceReply(PRACTICE_STATUS[reason], {
    ok: false,
    error: reason,
    message: PRACTICE_FAILURES[reason],
    ...(round ? { round } : {}),
  });
