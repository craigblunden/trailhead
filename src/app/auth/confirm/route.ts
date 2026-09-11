import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth-routing";
import { requestOrigin } from "@/lib/request-origin";
import { createServerSupabase } from "@/server/auth/supabase";

/**
 * Where the verification and password-reset mails land. The mail templates carry a token hash to
 * this route, which verifies it server-side — so a link works from any device, not only the
 * browser that started the sign-up.
 *
 * Verifying signs the user in (Route Handlers can write cookies), so a fresh sign-up lands
 * straight on their empty board. A bad link — expired, reused, malformed — is the normal case,
 * not the edge case: it renders a recoverable state on the relevant form, never a 500.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const origin = requestOrigin(request.headers, request.url);
  const isRecovery = type === "recovery";
  const failure = isRecovery ? "/forgot-password?error=link" : "/login?error=link";

  if (!tokenHash || (type !== "signup" && type !== "recovery" && type !== "email")) {
    return NextResponse.redirect(new URL(failure, origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL(failure, origin));
  }

  const destination = isRecovery ? "/reset-password" : safeNextPath(searchParams.get("next"));
  return NextResponse.redirect(new URL(destination, origin));
}
