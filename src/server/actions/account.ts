"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ACCOUNT_DELETED_PATH, EMAIL_MISMATCH, type AccountSummary } from "@/lib/account";
import { invalid, runAction, type ActionResult } from "@/server/action-result";
import { accountSummary, deleteAccount } from "@/server/data/account";
import { parseInput } from "@/server/validation";

/** An address is at most 254 characters; the spaces around one are forgiven, so allow a few. */
const confirmEmailSchema = z.string().max(320);

/** The signed-in Account and what its Tenant holds, for the account page and the delete dialog. Reads only. */
export async function accountSummaryAction(): Promise<ActionResult<AccountSummary>> {
  return runAction("account.summary", () => accountSummary());
}

/**
 * Account deletion, confirmed by the Account's email (checked by the data layer). On success the
 * response is a redirect to the landing page's notice, so the action returns only when something
 * went wrong.
 */
export async function deleteAccountAction(confirmEmail: unknown): Promise<ActionResult<null>> {
  const parsed = parseInput(confirmEmailSchema, confirmEmail);
  if (!parsed.ok) return invalid({ email: EMAIL_MISMATCH });

  const result = await runAction("account.delete", async () => {
    await deleteAccount(parsed.data);
    return null;
  });
  // Outside `runAction`: a redirect is thrown, and would otherwise be caught as a failure.
  if (result.ok) redirect(ACCOUNT_DELETED_PATH);
  return result;
}
