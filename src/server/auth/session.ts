import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_ENDED_PATH } from "@/lib/auth-routing";

import { createServerSupabase } from "./supabase";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in to continue");
    this.name = "UnauthenticatedError";
  }
}

/** What the application knows about the signed-in user. Nothing here is a secret. */
export type Session = {
  userId: string;
  email: string;
  /** Display name from sign-up, falling back to the local part of the email. */
  name: string;
  /** Every way the Account signs in, as Auth's provider ids (`email`, `google`, …). */
  providers: string[];
};

/**
 * Reads the session server-side, memoised per render pass with React's `cache` so one request
 * validates it once however many components ask. Null when there is no valid session — this is
 * the read for display purposes (the header) and for "already signed in" checks.
 *
 * `getClaims()` verifies the access token's signature rather than trusting the cookie, which is
 * what makes a forged cookie worthless past `proxy.ts`. With an asymmetric signing key it checks
 * against Auth's published keys, cached in memory, so a page navigation costs no round trip to
 * Auth; with a legacy shared secret it falls back to asking Auth, as `getUser()` would.
 *
 * The trade: a token signed before sign-out elsewhere stays valid until it expires (`jwt_expiry`),
 * and a name changed since it was issued shows once it refreshes. Signing out here clears the
 * cookie, so this browser is signed out at once.
 */
export const getOptionalSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const email = claims.email ?? "";
  const fullName =
    typeof claims.user_metadata?.full_name === "string" ? claims.user_metadata.full_name.trim() : "";
  return {
    userId: claims.sub,
    email,
    name: fullName || email.split("@")[0] || "You",
    providers: providersOf(claims.app_metadata),
  };
});

/**
 * Auth lists every identity linked to the Account in `app_metadata.providers`, and the first in
 * `provider`. The token's `amr` is only how this session signed in, so it is not used.
 */
function providersOf(appMetadata: unknown): string[] {
  const metadata = (appMetadata ?? {}) as { provider?: unknown; providers?: unknown };
  if (Array.isArray(metadata.providers)) {
    return metadata.providers.filter((id): id is string => typeof id === "string");
  }
  return typeof metadata.provider === "string" ? [metadata.provider] : [];
}

/**
 * The session, or an `UnauthenticatedError`. Every data-layer function calls this first, and no
 * function anywhere accepts a `userId` from its caller instead — the caller is untrusted even
 * when it is our own code, because Server Actions are reachable by direct POST.
 */
export async function requireSession(): Promise<Session> {
  const session = await getOptionalSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}

/**
 * For page components: the session, or a redirect to sign-in. A render can redirect; an action
 * cannot, which is why actions use `requireSession()` and return a result instead.
 *
 * The redirect carries `SESSION_ENDED` so `proxy.ts` knows to drop whatever cookie got this far
 * (expired, revoked, or forged) instead of bouncing the visitor straight back to the board.
 */
export async function requirePageSession(): Promise<Session> {
  const session = await getOptionalSession();
  if (!session) redirect(SESSION_ENDED_PATH);
  return session;
}
