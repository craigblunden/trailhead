import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import type {
  AttemptLength,
  RecordAnswerResponse,
  ScoreAttemptResponse,
  StartAttemptRequest,
  StartAttemptResponse,
} from "@/lib/interview";

/**
 * How the Interview Simulator reaches the server: three plain POSTs to the Route Handlers, never
 * Server Actions. Starting and scoring take 10–25 seconds each, and an Answer lands while a clock is
 * running — as actions, Next would dispatch them one at a time and queue the page's other work
 * behind them. Component tests replace this module, or mock `fetch` under it.
 */

const UNREACHABLE = "We couldn’t reach the server. Check your connection and try again.";
const UNREADABLE = "Something went wrong on our side. Try again in a minute.";

async function send<T extends { ok: boolean }>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, error: "failed", message: UNREACHABLE } as unknown as T;
  }
  const answer = (await response.json().catch(() => null)) as T | null;
  if (!answer) return { ok: false, error: "failed", message: UNREADABLE } as unknown as T;
  if (!answer.ok && (answer as { error?: string }).error === "unauthenticated") {
    // The session ended under us. Nothing on this page can succeed now; go and get a new one.
    window.location.assign(SESSION_ENDED_PATH);
  }
  return answer;
}

export const interviewClient = {
  start: (jobId: string, length: AttemptLength, reset = false): Promise<StartAttemptResponse> =>
    send(`/api/jobs/${encodeURIComponent(jobId)}/interview`, { length, reset } satisfies StartAttemptRequest),

  answer: (
    attemptId: string,
    answer: { questionId: string; transcript: string; elapsedSeconds: number },
  ): Promise<RecordAnswerResponse> => send(`/api/attempts/${encodeURIComponent(attemptId)}/answer`, answer),

  /** The countdown ran out: no body, so nothing half-typed is recorded. */
  timeUp: (attemptId: string): Promise<RecordAnswerResponse> =>
    send(`/api/attempts/${encodeURIComponent(attemptId)}/answer`),

  score: (attemptId: string): Promise<ScoreAttemptResponse> =>
    send(`/api/attempts/${encodeURIComponent(attemptId)}/score`),
};

export type InterviewClient = typeof interviewClient;
