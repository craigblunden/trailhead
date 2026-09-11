import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { uniqueEmail } from "../../e2e/mail";
import {
  FAKE_PROVIDER_SLOT,
  newProviderUserId,
  startFakeProvider,
  type FakeProvider,
} from "../fakes/oauth-provider";
import { authClient, PASSWORD, passwordAccount, passwordSignIn, socialSignIn } from "./social-helpers";

/**
 * Account linking (ticket 07), asserted against the local Auth server itself rather than its
 * documentation. Every social sign-in here is a real OAuth round trip through Auth; only the
 * identity provider is fake (`tests/fakes/oauth-provider.ts`). Auth's linking decision does not
 * depend on which provider the identity came from, so what holds here holds for Google and GitHub.
 *
 * Auth finds an existing identity by (provider, provider's user id) before it looks at email, so
 * every test uses a fresh provider user id.
 */

let provider: FakeProvider;
beforeAll(async () => {
  provider = await startFakeProvider();
});
afterAll(() => provider.close());

const providersOf = (user: { identities?: { provider: string }[] }) =>
  (user.identities ?? []).map((identity) => identity.provider).sort();

describe("social identity linking (ticket 07)", () => {
  it("LINK-1: a verified social identity for an address with a verified password account is the SAME user", async () => {
    const account = await passwordAccount();

    const outcome = await socialSignIn(provider, {
      providerUserId: newProviderUserId(),
      email: account.email,
      emailVerified: true,
      name: "Sam Rivera",
    });

    expect(outcome.kind).toBe("signed-in");
    if (outcome.kind !== "signed-in") return;
    // One user id means one tenant: the same board, the same jobs, whichever way they sign in.
    expect(outcome.user.id).toBe(account.userId);
    expect(providersOf(outcome.user)).toEqual(["email", FAKE_PROVIDER_SLOT].sort());

    // And the password keeps working, onto the same user.
    const again = await passwordSignIn(account.email);
    expect(again.error).toBeNull();
    expect(again.data.user?.id).toBe(account.userId);
  });

  it("LINK-2: a provider that does not vouch for the address never reaches the existing account", async () => {
    const account = await passwordAccount();

    const outcome = await socialSignIn(provider, {
      providerUserId: newProviderUserId(),
      email: account.email,
      emailVerified: false,
      name: "Somebody Else",
    });

    // Refused outright — not linked, and not a second account quietly created alongside.
    expect(outcome).toMatchObject({ kind: "refused", errorCode: "provider_email_needs_verification" });
    const owner = await passwordSignIn(account.email);
    expect(owner.data.user?.id).toBe(account.userId);
    expect(providersOf(owner.data.user!)).toEqual(["email"]);
  });

  it("LINK-3: an unverified password sign-up cannot squat an address and intercept its real owner", async () => {
    // Someone registers the owner's address with their own password and never verifies it.
    const squatted = await passwordAccount({ verify: false });

    const outcome = await socialSignIn(provider, {
      providerUserId: newProviderUserId(),
      email: squatted.email,
      emailVerified: true,
      name: "Real Owner",
    });

    expect(outcome.kind).toBe("signed-in");
    if (outcome.kind !== "signed-in") return;
    // Auth keeps the never-used row but strips the unverified password identity from it…
    expect(providersOf(outcome.user)).toEqual([FAKE_PROVIDER_SLOT]);
    // …so the squatter's password no longer opens it.
    const squatter = await passwordSignIn(squatted.email);
    expect(squatter.error).not.toBeNull();
    expect(squatter.data.user).toBeNull();
  });

  it("LINK-4: once an address signed up socially, a password sign-up for it creates no second account", async () => {
    const email = uniqueEmail("social-first");
    const identity = { providerUserId: newProviderUserId(), email, emailVerified: true, name: "Social First" };
    const first = await socialSignIn(provider, identity);
    expect(first.kind).toBe("signed-in");
    if (first.kind !== "signed-in") return;

    const signUp = await authClient().auth.signUp({ email, password: PASSWORD });
    // Auth reports the address as taken; `signUpAction` folds that into the same "check your
    // email" a new address sees, so the form does not leak it.
    expect(signUp.error?.message).toMatch(/already registered/i);
    expect((await passwordSignIn(email)).error).not.toBeNull();

    const second = await socialSignIn(provider, identity);
    expect(second.kind === "signed-in" && second.user.id).toBe(first.user.id);
  });

  it("LINK-5: a returning provider account is recognised by its provider user id before its email", async () => {
    const identity = { providerUserId: newProviderUserId(), email: uniqueEmail("renamed"), emailVerified: true, name: "Renamed" };
    const first = await socialSignIn(provider, identity);
    expect(first.kind).toBe("signed-in");
    if (first.kind !== "signed-in") return;

    // The person changed the address on their provider account since.
    const later = await socialSignIn(provider, { ...identity, email: uniqueEmail("renamed-later") });

    expect(later.kind === "signed-in" && later.user.id).toBe(first.user.id);
  });
});
