import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  authRedirect,
  isSessionCookie,
  isSessionEndedRequest,
  sessionExpiry,
} from "@/lib/auth-routing";
import { requestOrigin } from "@/lib/request-origin";
import { supabasePublicEnv } from "@/lib/supabase-env";

/** Refresh when the access token has this long (or less) left, so a render never has to. */
const REFRESH_WITHIN_SECONDS = 5 * 60;

/**
 * Optimistic redirects, and nothing that counts as authorization.
 *
 * Signed-out visitors to the board go to sign-in; signed-in visitors to the landing page or sign-in
 * go to the board.
 * "Signed in" here means the session COOKIE says so — parsed locally, no signature check, no
 * network — because this runs on every prefetch. Pages call `requirePageSession()` and the data
 * layer `requireSession()`, both of which validate with Auth, whatever happens here. Delete this
 * file and every one of those still holds.
 *
 * Two practical duties ride along:
 * - A page that found no valid session behind a cookie (expired, revoked, forged) sends the
 *   visitor to `SESSION_ENDED_PATH`. That request drops the cookie and renders sign-in, instead
 *   of bouncing back to the board on the strength of the same cookie.
 * - A Server Component cannot write cookies, so if the access token were refreshed during a
 *   render the rotated refresh token would be lost and Auth would later flag its reuse and
 *   revoke the session. When the token is close to expiry, the refresh happens here, on the
 *   response, which is what keeps a tracker left open overnight signed in.
 */
export async function proxy(request: NextRequest) {
  const origin = requestOrigin(request.headers, request.url);
  const cookies = request.cookies.getAll();
  const expiresAt = sessionExpiry(cookies);
  const { pathname, searchParams } = request.nextUrl;

  if (isSessionEndedRequest(pathname, searchParams)) {
    const response = NextResponse.next({ request });
    for (const cookie of cookies) {
      if (isSessionCookie(cookie.name)) response.cookies.delete(cookie.name);
    }
    return response;
  }

  const signedIn = expiresAt !== null;
  const target = authRedirect(pathname, signedIn);
  let response = target
    ? NextResponse.redirect(new URL(target, origin))
    : NextResponse.next({ request });

  const secondsLeft = expiresAt === null ? Infinity : expiresAt - Date.now() / 1000;
  if (signedIn && secondsLeft <= REFRESH_WITHIN_SECONDS) {
    const { url, publishableKey } = supabasePublicEnv();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = target
            ? NextResponse.redirect(new URL(target, origin))
            : NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    // Refreshes an expired or expiring token and hands the new cookies to `setAll` above. Its
    // answer is not used for anything else; a failure leaves the page to decide.
    await supabase.auth.getClaims().catch(() => undefined);
  }

  return response;
}

export const config = {
  // Only the routes with a signed-in / signed-out opinion. The landing page is still prerendered;
  // matching it costs a cookie parse per visit, not a render. Auth callbacks, `_next` assets, and
  // static files never match, so a bad cookie can never block a stylesheet or a verification link.
  matcher: ["/", "/board/:path*", "/contacts/:path*", "/documents/:path*", "/login", "/signup"],
};
