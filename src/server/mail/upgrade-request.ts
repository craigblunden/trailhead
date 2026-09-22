import "server-only";

import { PLAN_LABEL, UPGRADE_REQUEST_LAPSES_AFTER_DAYS, type Plan } from "@/lib/plans";
import type { Session } from "@/server/auth/session";
import { oneLine, sendToOwner, type OwnerEmail } from "@/server/mail/send";

/**
 * An Upgrade request (CONTEXT.md; ADR-0009) reaching the owner's inbox. There is no payment path and
 * no automatic grant: the owner reads this and runs `npm run db:plan` (ADR-0001), so the email carries
 * everything that decision needs — including the command line to paste.
 *
 * Nothing goes to the Tenant, here or when the Plan is granted. See `send.ts`.
 */

export type UpgradeRequestEmail = OwnerEmail;

export type UpgradeRequestDetails = {
  /** The Plan the Tenant is on now. */
  current: Plan;
  /** The Plan being asked for — the next one up. */
  wanted: Plan;
  /** How many requests this Tenant has made, this one included. */
  asked: number;
  /** When the first of them was made. The same date as this one on a first ask. */
  since: Date;
};

/** A date the owner reads, not a timestamp to parse: the day is all this decision turns on. */
const day = (date: Date) => date.toISOString().slice(0, 10);

export function composeUpgradeRequestEmail(
  session: Session,
  { current, wanted, asked, since }: UpgradeRequestDetails,
): UpgradeRequestEmail {
  const name = oneLine(session.name);
  return {
    // Stable across repeats, so a Tenant who asks more than once threads in the owner's inbox.
    subject: `Trailhead upgrade request: ${wanted} for ${name}`,
    replyTo: session.email,
    text: [
      `${name} <${session.email}> would like to move up a plan.`,
      "",
      `On: ${PLAN_LABEL[current]}`,
      `Wants: ${PLAN_LABEL[wanted]}`,
      `User id: ${session.userId}`,
      // The history, so a request that has been outstanding since June does not read like a new one.
      asked > 1 ? `Asked ${asked} times since ${day(since)}` : "Asked for the first time",
      "",
      "To grant it:",
      `  npm run db:plan -- ${session.email} ${wanted}`,
      "",
      // Said plainly, because doing nothing is a supported answer and the Tenant is not left waiting
      // on the button for good.
      `Doing nothing is a soft no: the request lapses after ${UPGRADE_REQUEST_LAPSES_AFTER_DAYS} days and they can ask again.`,
    ].join("\n"),
  };
}

/** Sends one Upgrade request to the owner. Throws on anything but delivery. */
export async function sendUpgradeRequest(
  session: Session,
  details: UpgradeRequestDetails,
): Promise<void> {
  await sendToOwner(composeUpgradeRequestEmail(session, details));
}
