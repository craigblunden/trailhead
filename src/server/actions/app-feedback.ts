"use server";

import { invalid, runAction, type ActionResult } from "@/server/action-result";
import { sendAppFeedback } from "@/server/mail/app-feedback";
import { appFeedbackSchema, parseInput } from "@/server/validation";

/** Emails the owner a rating and the user's words. A public POST endpoint: the input is untrusted. */
export async function sendAppFeedbackAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = parseInput(appFeedbackSchema, input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("appFeedback.send", async () => {
    await sendAppFeedback(parsed.data);
    return null;
  });
}
