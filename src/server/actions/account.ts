"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ACCOUNT_DELETED_PATH, EMAIL_MISMATCH, emailsMatch, type AccountSummary } from "@/lib/account";
import { invalid, runAction, type ActionResult } from "@/server/action-result";
import { requireSession } from "@/server/auth/session";
import { accountSummary, deleteAccount } from "@/server/data/account";
import { RuleError } from "@/server/data/errors";
import { parseInput } from "@/server/validation";

/** An address is at most 254 characters; the spaces around one are forgiven, so allow a few. */
const confirmEmailSchema = z.string().max(320);

/** The signed-in Account and what its Tenant holds, for the account page and the delete dialog. Reads only. */
export async function accountSummaryAction(): Promise<ActionResult<AccountSummary>> {
  return runAction("account.summary", () => accountSummary());
}

/**
 * Account deletion. Refused unless `confirmEmail` is the Account's own email — the dialog checks the
 * same, and this is the check that counts. On success the response is a redirect to the landing
 * page's notice, so the action returns only when something went wrong.
 */
export async function deleteAccountAction(confirmEmail: unknown): Promise<ActionResult<null>> {
  const parsed = parseInput(confirmEmailSchema, confirmEmail);
  if (!parsed.ok) return invalid({ email: EMAIL_MISMATCH });

  const result = await runAction("account.delete", async () => {
    const { email } = await requireSession();
    if (!emailsMatch(parsed.data, email)) throw new RuleError("email-mismatch", EMAIL_MISMATCH);
    await deleteAccount();
    return null;
  });
  // Outside `runAction`: a redirect is thrown, and would otherwise be caught as a failure.
  if (result.ok) redirect(ACCOUNT_DELETED_PATH);
  return result;
}
