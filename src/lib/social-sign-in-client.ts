import { createBrowserClient } from "@supabase/ssr";

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
  const supabase = createBrowserClient(url, publishableKey);
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}
