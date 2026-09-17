import "server-only";

import { APP_FEEDBACK_CONTEXT_LABEL, APP_FEEDBACK_RATINGS } from "@/lib/app-feedback";
import { requireSession, type Session } from "@/server/auth/session";
import type { AppFeedbackInput } from "@/server/validation";

/**
 * App feedback goes to the owner's inbox through Resend's HTTP API, and nowhere else: no row, no
 * log line carrying the words. Plain text only, so nothing the user typed is ever rendered as HTML.
 *
 * Configured by `RESEND_API_KEY` (set by the Resend integration) and `APP_FEEDBACK_TO_EMAIL`.
 * `APP_FEEDBACK_FROM_EMAIL` is a sender on a domain verified in Resend; without one, Resend's
 * shared test sender is used, which only delivers to the Resend account's own address.
 */

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const TEST_SENDER = "Trailhead <onboarding@resend.dev>";

export type AppFeedbackEmail = { subject: string; text: string; replyTo: string };

/** A header value must stay on one line, whatever the user's name holds. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export function composeAppFeedbackEmail(session: Session, input: AppFeedbackInput): AppFeedbackEmail {
  const rating = `${input.rating}/${APP_FEEDBACK_RATINGS.length}`;
  const from = `${oneLine(session.name)} <${session.email}>`;
  // Asked from somewhere in particular, the email says where, so the owner reads it in that light.
  const about = input.context ? APP_FEEDBACK_CONTEXT_LABEL[input.context] : null;
  return {
    subject: `Trailhead feedback${about ? ` on the ${about}` : ""}: ${rating} from ${oneLine(session.name)}`,
    replyTo: session.email,
    text: [
      ...(about ? [`About: ${about}`] : []),
      `Rating: ${rating}`,
      `From: ${from}`,
      `User id: ${session.userId}`,
      "",
      input.message,
    ].join("\n"),
  };
}

/** Sends one piece of App feedback from the signed-in user. Throws on anything but delivery. */
export async function sendAppFeedback(input: AppFeedbackInput): Promise<void> {
  const session = await requireSession();

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.APP_FEEDBACK_TO_EMAIL;
  if (!apiKey || !to) throw new Error("App feedback mail is not configured");

  const email = composeAppFeedbackEmail(session, input);
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.APP_FEEDBACK_FROM_EMAIL || TEST_SENDER,
      to: [to],
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  // Resend's body names the problem ("API key is invalid"); the status is enough to diagnose, and
  // the message stays in the log, never in the result.
  if (!response.ok) throw new Error(`Resend refused the email with status ${response.status}`);
}
