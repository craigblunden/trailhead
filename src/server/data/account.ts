import "server-only";

import type { AccountSummary } from "@/lib/account";
import { requireSession } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { withTenant } from "@/server/db/tenant";
import { logError, logEvent } from "@/server/log";
import { documentsBucket } from "@/server/storage/documents-bucket";

import { heldBy } from "./documents";
import { AccountDeletionError } from "./errors";
import { planOf } from "./plans";

/**
 * The data access layer for the Account (CONTEXT.md) and Account deletion (ADR-0004).
 *
 * Account deletion spans Storage and Postgres with no transaction across them, so the order is the
 * design:
 *
 * 1. **Storage, as the user.** Every object under `<userId>/` is removed through the Storage API with
 *    the user's own session. A failure stops here with nothing else touched.
 * 2. **Postgres, one transaction.** `public.erase_my_account()` erases every tenant row and then the
 *    Auth user. A failure here leaves the board intact and the files possibly gone; a retry finishes,
 *    because removing a missing object is a no-op.
 * 3. **Sign-out.** The Account is already gone, so a failure is logged and nothing more.
 *
 * Storage is never called inside `withTenant()`: it holds a pooled connection under a timeout.
 */

/** `list` and `remove` take a page at a time. */
const STORAGE_PAGE = 100;

/** Who is signed in, how, on which Plan, and what their Tenant holds. */
export async function accountSummary(): Promise<AccountSummary> {
  const { userId, name, email, providers } = await requireSession();
  const held = await withTenant(userId, async (tx, tenant) => ({
    plan: await planOf(tenant),
    jobs: await tx.job.count({ where: { userId } }),
    documents: await tx.document.count({ where: heldBy(userId) }),
    contacts: await tx.contact.count({ where: { userId } }),
  }));
  return { name, email, providers, ...held };
}

/**
 * Ends the signed-in Account and erases its Tenant, at once and for good. Throws an
 * `AccountDeletionError` naming the step that failed; the email is never logged.
 */
export async function deleteAccount(): Promise<void> {
  const { userId } = await requireSession();
  const operation = "account.delete";

  try {
    await removeEveryObject(userId);
  } catch (error) {
    logError({ operation, tenant: userId, step: "storage" }, error);
    throw new AccountDeletionError("storage");
  }

  try {
    await withTenant(userId, (tx) => tx.$queryRaw`select public.erase_my_account()`);
  } catch (error) {
    logError({ operation, tenant: userId, step: "erase" }, error);
    throw new AccountDeletionError("erase");
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    // The Account is gone; at worst the cookie outlives it until the redirect's session check drops it.
    logError({ operation, tenant: userId, step: "sign-out" }, error);
  }

  logEvent({ operation, tenant: userId });
}

/**
 * Removes every object under the user's prefix: whatever a full listing finds, and every Document
 * row's key besides — tombstones too — in case the listing misses an object that has just landed.
 */
async function removeEveryObject(userId: string): Promise<void> {
  const rows = await withTenant(userId, (tx) =>
    tx.document.findMany({ where: { userId }, select: { storageKey: true } }),
  );
  const bucket = await documentsBucket();

  const listed: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await bucket.list(userId, { limit: STORAGE_PAGE, offset });
    if (error) throw error;
    // A folder has no id; keys are flat under the prefix, so there is nothing inside one to remove.
    listed.push(...data.filter((object) => object.id !== null).map((object) => `${userId}/${object.name}`));
    if (data.length < STORAGE_PAGE) break;
  }

  const keys = [...new Set([...listed, ...rows.map((row) => row.storageKey)])];
  for (let start = 0; start < keys.length; start += STORAGE_PAGE) {
    const { error } = await bucket.remove(keys.slice(start, start + STORAGE_PAGE));
    if (error) throw error;
  }
}
