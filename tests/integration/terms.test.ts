import { beforeEach, describe, expect, it } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { TERMS_VERSION } from "@/lib/terms";
import { acceptTermsAction } from "@/server/actions/terms";
import { UnauthenticatedError } from "@/server/auth/session";
import { acceptCurrentTerms, hasAcceptedCurrentTerms } from "@/server/data/terms";
import { withTenant } from "@/server/db/tenant";

import { newUserId, resetTables } from "./helpers";

/**
 * Terms acceptance against the real database and its policies (terms tickets 03, 04; ADR-0008).
 *
 * What is proved here is what the gate rests on: an Account with no row at all is gated (which is the
 * backfill), an Account holding only an earlier version is gated again (which is what bumping
 * `TERMS_VERSION` does), the record is append-only, and no Tenant can see another's.
 */

/** A version that is not the current one — what an Account that accepted before a bump is holding. */
const PREVIOUS_VERSION = "2000-01-01";

const accepted = (userId: string) =>
  withTenant(userId, (tx) =>
    tx.termsAcceptance.findMany({ where: { userId }, orderBy: { version: "asc" } }),
  );

beforeEach(async () => {
  await resetTables();
  signOut();
});

describe("terms ticket 03: the acceptance record", () => {
  it("TERMS-9: an Account with no row at all has not accepted — the backfill needs no migration", async () => {
    const userId = newUserId();
    signInAs(userId);
    expect(await hasAcceptedCurrentTerms()).toBe(false);
    expect(await accepted(userId)).toEqual([]);
  });

  it("TERMS-10: accepting writes one row, for the current version, and says so afterwards", async () => {
    const userId = newUserId();
    signInAs(userId);

    await acceptCurrentTerms(new Date("2026-09-22T10:00:00Z"));

    const rows = await accepted(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId, version: TERMS_VERSION });
    expect(rows[0].acceptedAt.toISOString()).toBe("2026-09-22T10:00:00.000Z");
    expect(await hasAcceptedCurrentTerms()).toBe(true);
  });

  it("TERMS-11: accepting twice leaves one row, still stamped with the first time", async () => {
    const userId = newUserId();
    signInAs(userId);

    await acceptCurrentTerms(new Date("2026-09-22T10:00:00Z"));
    await acceptCurrentTerms(new Date("2026-09-23T10:00:00Z"));

    const rows = await accepted(userId);
    expect(rows).toHaveLength(1);
    // Append-only: the moment they actually agreed, not the moment a retry landed.
    expect(rows[0].acceptedAt.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });

  it("TERMS-12: a new version is a new row, and the old one is left exactly as it was", async () => {
    const userId = newUserId();
    signInAs(userId);
    await withTenant(userId, (tx) =>
      tx.termsAcceptance.create({
        data: { userId, version: PREVIOUS_VERSION, acceptedAt: new Date("2026-01-01T00:00:00Z") },
      }),
    );

    await acceptCurrentTerms(new Date("2026-09-22T10:00:00Z"));

    const rows = await accepted(userId);
    expect(rows.map((row) => row.version)).toEqual([PREVIOUS_VERSION, TERMS_VERSION]);
    expect(rows[0].acceptedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("TERMS-13: bumping the version gates an Account that accepted the previous one", async () => {
    const userId = newUserId();
    signInAs(userId);
    // Exactly what a bump leaves behind: a row for a version that is no longer current.
    await withTenant(userId, (tx) =>
      tx.termsAcceptance.create({ data: { userId, version: PREVIOUS_VERSION } }),
    );

    expect(await hasAcceptedCurrentTerms()).toBe(false);

    await acceptCurrentTerms();
    expect(await hasAcceptedCurrentTerms()).toBe(true);
  });

  it("TERMS-14: one Tenant's acceptance is not another's, and is not visible to them", async () => {
    const a = newUserId();
    const b = newUserId();

    signInAs(a);
    await acceptCurrentTerms();

    signInAs(b);
    expect(await hasAcceptedCurrentTerms()).toBe(false);
    expect(await accepted(b)).toEqual([]);
    // The policy, not a filter: b's transaction cannot see a's row even when it names a's id.
    expect(await withTenant(b, (tx) => tx.termsAcceptance.findMany({ where: { userId: a } }))).toEqual([]);
  });

  it("TERMS-15: nothing is recorded for a request with no session", async () => {
    await expect(hasAcceptedCurrentTerms()).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(acceptCurrentTerms()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("terms ticket 04: the action behind the gate", () => {
  it("TERMS-16: records the acceptance and reports success", async () => {
    const userId = newUserId();
    signInAs(userId);

    expect(await acceptTermsAction()).toEqual({ ok: true, data: null });
    expect(await hasAcceptedCurrentTerms()).toBe(true);
  });

  it("TERMS-17: answers a signed-out caller with the ended-session failure, writing nothing", async () => {
    const result = await acceptTermsAction();
    expect(result).toMatchObject({ ok: false, error: "unauthenticated" });
  });
});
