import "server-only";

import { cache } from "react";

import { TERMS_VERSION } from "@/lib/terms";
import { requireSession } from "@/server/auth/session";
import { withTenant } from "@/server/db/tenant";

/**
 * The data access layer for Terms acceptance (terms ticket 03; **ADR-0008**). Two functions: has this
 * Account agreed to the current version, and record that it has.
 *
 * `TermsAcceptance` is **append-only**. A new version is a new row, so the history says who accepted
 * what and when; nothing here updates or deletes one. Accepting a version already held is the same
 * row again, which is why the write is an upsert that changes nothing — a double submit cannot move
 * an `acceptedAt` that has already been recorded.
 */

/**
 * Whether the signed-in Account has accepted `TERMS_VERSION`. Memoised per render pass with React's
 * `cache`, like the session, so the layout's gate costs one query however many components ask.
 *
 * False for an Account that accepted an earlier version, and for one that predates the terms
 * existing — the same answer, deliberately, because the gate is the backfill (**ADR-0008**) and a
 * second code path that only runs once is a second code path to get wrong.
 */
export const hasAcceptedCurrentTerms = cache(async (): Promise<boolean> => {
  const { userId } = await requireSession();
  const row = await withTenant(userId, (tx) =>
    tx.termsAcceptance.findUnique({
      where: { userId_version: { userId, version: TERMS_VERSION } },
      select: { acceptedAt: true },
    }),
  );
  return row !== null;
});

/**
 * Records that the signed-in Account accepted `TERMS_VERSION`, now. Idempotent: the row is keyed by
 * the pair, so accepting twice leaves one row with the first `acceptedAt` — the moment they actually
 * agreed, not the moment a retry landed.
 */
export async function acceptCurrentTerms(now: Date = new Date()): Promise<void> {
  const { userId } = await requireSession();
  await withTenant(userId, (tx) =>
    tx.termsAcceptance.upsert({
      where: { userId_version: { userId, version: TERMS_VERSION } },
      create: { userId, version: TERMS_VERSION, acceptedAt: now },
      update: {},
    }),
  );
}
