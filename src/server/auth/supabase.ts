import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublicEnv } from "@/lib/supabase-env";

/**
 * A Supabase client bound to this request's cookies, for Server Components, Server Actions, and
 * Route Handlers. Uses the publishable key only: every call it makes is subject to Auth's own
 * rules and to Storage's row-level security as the signed-in user.
 */
export async function createServerSupabase() {
  const { url, publishableKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A Server Component cannot write cookies. That is fine: `proxy.ts` refreshes an
          // expiring session on the way in, so by the time a render reads it the cookies are
          // already current.
        }
      },
    },
  });
}
