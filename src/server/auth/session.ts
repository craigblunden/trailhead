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
};

/**
 * Reads the session server-side, memoised per render pass with React's `cache` so one request
 * validates it once however many components ask. Null when there is no valid session — this is
 * the read for display purposes (the header) and for "already signed in" checks.
 *
 * `getUser()` validates against the Auth server rather than trusting the cookie, which is what
 * makes a forged cookie worthless past `proxy.ts`.
 */
export const getOptionalSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const email = user.email ?? "";
  const fullName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return {
    userId: user.id,
    email,
    name: fullName || email.split("@")[0] || "You",
  };
});

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
