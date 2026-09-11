import { NextResponse, type NextRequest } from "next/server";

import { requestOrigin } from "@/lib/request-origin";
import { createServerSupabase } from "@/server/auth/supabase";
import { logError } from "@/server/log";

const OPERATION = { operation: "auth.oauth-callback" };

/**
 * Where social sign-in comes back to (ticket 07). Auth has already talked to the provider and
 * decided which user this identity belongs to; what arrives here is a single-use PKCE code, which
 * is exchanged for a session using the verifier the browser client left in a cookie.
 *
 * Every failure — the user declined at the provider, Auth refused the identity, the code was
 * reused or its verifier is gone — lands on sign-in with one recoverable notice, never a 500 and
 * never the provider's own error text.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = requestOrigin(request.headers, request.url);
  const failure = NextResponse.redirect(new URL("/login?error=oauth", origin));

  const code = searchParams.get("code");
  if (!code) {
    // Auth reports a refusal in the query and again in the URL fragment. Only the query reaches
    // this route, and it is logged; the fragment rides along into the sign-in page's URL.
    const reason = searchParams.get("error_code") ?? searchParams.get("error");
    if (reason) logError(OPERATION, new Error(`provider returned ${reason}`));
    return failure;
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logError(OPERATION, error);
    return failure;
  }

  return NextResponse.redirect(new URL("/board", origin));
}
