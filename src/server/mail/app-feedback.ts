import "server-only";

import { APP_FEEDBACK_CONTEXT_LABEL, APP_FEEDBACK_RATINGS } from "@/lib/app-feedback";
import { requireSession, type Session } from "@/server/auth/session";
import { oneLine, sendToOwner, type OwnerEmail } from "@/server/mail/send";
import type { AppFeedbackInput } from "@/server/validation";

/**
 * App feedback goes to the owner's inbox and nowhere else: no row, no log line carrying the words.
 * The sender, its configuration and the plain-text rule live in `send.ts`.
 */

export type AppFeedbackEmail = OwnerEmail;

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
  await sendToOwner(composeAppFeedbackEmail(session, input));
}
