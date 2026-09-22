import "server-only";

/**
 * The one way this application sends mail: a plain-text email to the owner, through Resend's HTTP
 * API. Shared by App feedback and Upgrade requests.
 *
 * **Every mail path here points at the owner.** Trailhead sends nothing to its users — the only mail
 * a user receives is Supabase Auth's own (verification, password reset). A user-facing sender would
 * need a verified domain, an unsubscribe story and a deliverability problem, for a product with one
 * operator. When a Tenant's Plan changes, they find out by looking at the page.
 *
 * Plain text only, so nothing a user typed is ever rendered as HTML.
 *
 * Configured by `RESEND_API_KEY` (set by the Resend integration), `OWNER_TO_EMAIL`, and
 * `OWNER_FROM_EMAIL` — a sender on a domain verified in Resend. Without one, Resend's shared test
 * sender is used, which only delivers to the Resend account's own address. The older
 * `APP_FEEDBACK_TO_EMAIL` / `APP_FEEDBACK_FROM_EMAIL` names are still read, so a deployment set up
 * before there was more than one kind of mail keeps working.
 */

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const TEST_SENDER = "Trailhead <onboarding@resend.dev>";

/** One email to the owner. `replyTo` is the user it is about, so replying reaches them. */
export type OwnerEmail = { subject: string; text: string; replyTo: string };

/** A header value must stay on one line, whatever the user's name holds. */
export const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** Sends one email to the owner. Throws on anything but delivery. */
export async function sendToOwner(email: OwnerEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_TO_EMAIL || process.env.APP_FEEDBACK_TO_EMAIL;
  if (!apiKey || !to) throw new Error("Owner mail is not configured");

  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.OWNER_FROM_EMAIL || process.env.APP_FEEDBACK_FROM_EMAIL || TEST_SENDER,
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
