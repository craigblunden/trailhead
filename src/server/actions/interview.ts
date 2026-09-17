"use server";

import type { InterviewQuotaStatus } from "@/lib/interview";
import { runAction, type ActionResult } from "@/server/action-result";
import { interviewQuota } from "@/server/data/interview";

/**
 * Interviews left this week, for the account page. Reads only. The simulator itself posts to its
 * Route Handlers instead (`src/components/interview/interview-client.ts`).
 */
export async function interviewQuotaAction(): Promise<ActionResult<InterviewQuotaStatus>> {
  return runAction("interview.quota", () => interviewQuota());
}
