import { send } from "@/components/interview/interview-client";
import type { RecordAnswerRequest, TimeUpRequest } from "@/lib/interview";
import type { PracticeRoundResponse, StartPracticeRequest } from "@/lib/practice";

/**
 * How a Practice round reaches the server (practice round ticket 03): plain POSTs to its two Route
 * Handlers, sent the way the Interview Simulator's are. Component tests replace this module.
 */
export const practiceClient = {
  start: (reset = false): Promise<PracticeRoundResponse> =>
    send("/api/practice-rounds", { reset } satisfies StartPracticeRequest),

  answer: (roundId: string, answer: RecordAnswerRequest): Promise<PracticeRoundResponse> =>
    send(`/api/practice-rounds/${encodeURIComponent(roundId)}/answer`, answer),

  /** The countdown ran out: what had been said on the question on screen goes with it; with nothing said, no body. */
  timeUp: (roundId: string, partial?: { questionId: string; transcript: string }): Promise<PracticeRoundResponse> =>
    send(
      `/api/practice-rounds/${encodeURIComponent(roundId)}/answer`,
      partial ? ({ timeUp: true, ...partial } satisfies TimeUpRequest) : undefined,
    ),
};

export type PracticeClient = typeof practiceClient;
