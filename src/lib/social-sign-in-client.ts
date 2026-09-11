import type { SocialProviderId } from "@/lib/social-providers";
import { supabasePublicEnv } from "@/lib/supabase-env";

/**
 * Sends the browser to the provider. OAuth is a browser redirect, so unlike every other auth path
 * this one starts client-side. The browser client uses PKCE: it keeps the code verifier in a
 * cookie, and `/auth/callback` exchanges the returned code for a session server-side.
 *
 * Resolves as the page starts to navigate away; rejects only when the redirect could not start.
 */
export async function startSocialSignIn(provider: SocialProviderId): Promise<void> {
  const { url, publishableKey } = supabasePublicEnv();
  // Loaded on the click, not with the page: sign-in and sign-up would otherwise ship the whole
  // Supabase client even when no provider is configured (performance ticket 01).
  const { createBrowserClient } = await import("@supabase/ssr");
  const supabase = createBrowserClient(url, publishableKey);
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}
