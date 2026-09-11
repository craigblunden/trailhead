import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { uniqueEmail, waitForMail } from "../../e2e/mail";
import {
  FAKE_PROVIDER_SLOT,
  redirectLocation,
  type FakeIdentity,
  type FakeProvider,
} from "../fakes/oauth-provider";

/** Allow-listed in `supabase/config.toml`; never fetched — only its query string is read. */
const APP_CALLBACK = "http://127.0.0.1:3100/auth/callback";

/** A browser-less Auth client: PKCE, publishable key, a session in memory and nowhere else. */
export function authClient(): SupabaseClient {
  const store = new Map<string, string>();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage: {
          getItem: (key) => store.get(key) ?? null,
          setItem: (key, value) => void store.set(key, value),
          removeItem: (key) => void store.delete(key),
        },
      },
    },
  );
}

/** Matches `e2e/fixtures.ts`, which cannot be imported here: it pulls in `@playwright/test`. */
export const PASSWORD = "trailhead-pass-1";

/** Signs up through Auth and, unless told not to, follows the real verification mail. */
export async function passwordAccount({ verify = true } = {}): Promise<{
  email: string;
  userId: string;
}> {
  const email = uniqueEmail("social");
  const sentAfter = Date.now() - 2_000;
  const client = authClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { full_name: "Sam Rivera" }, emailRedirectTo: APP_CALLBACK },
  });
  if (error || !data.user) throw error ?? new Error("sign-up returned no user");
  if (verify) {
    const mail = await waitForMail(email, /confirm/i, { after: sentAfter });
    const link = new URL(mail.links.find((href) => href.includes("token_hash"))!);
    const verified = await client.auth.verifyOtp({
      type: "signup",
      token_hash: link.searchParams.get("token_hash")!,
    });
    if (verified.error) throw verified.error;
  }
  return { email, userId: data.user.id };
}

export type SocialOutcome =
  | { kind: "signed-in"; user: User }
  | { kind: "refused"; errorCode: string | null; description: string | null };

/**
 * One complete social sign-in, driven hop by hop the way a browser would follow the redirects:
 * Auth's authorize endpoint → the provider's consent screen → Auth's callback → the app's
 * callback URL, whose code is then exchanged exactly as `/auth/callback` exchanges it.
 */
export async function socialSignIn(provider: FakeProvider, identity: FakeIdentity): Promise<SocialOutcome> {
  provider.setIdentity(identity);
  const client = authClient();
  const { data, error } = await client.auth.signInWithOAuth({
    // The fake stands in the test-only slot; the flow is identical for every provider.
    provider: FAKE_PROVIDER_SLOT,
    options: { redirectTo: APP_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const toProvider = await redirectLocation(data.url);
  const toAuthCallback = await provider.authorize(toProvider);
  const toApp = new URL(await redirectLocation(toAuthCallback));

  const code = toApp.searchParams.get("code");
  if (!code) {
    const fragment = new URLSearchParams(toApp.hash.slice(1));
    const param = (key: string) => toApp.searchParams.get(key) ?? fragment.get(key);
    return {
      kind: "refused",
      errorCode: param("error_code") ?? param("error"),
      description: param("error_description"),
    };
  }
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
  return { kind: "signed-in", user: exchanged.data.user };
}

export async function passwordSignIn(email: string, password = PASSWORD) {
  return authClient().auth.signInWithPassword({ email, password });
}
