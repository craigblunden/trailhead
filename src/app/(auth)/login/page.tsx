import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { enabledSocialProviders } from "@/lib/social-providers";
import { resendVerificationAction, signInAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or create a new account to get a fresh one.",
  ended: "Your session has ended. Sign in again to pick up where you left off.",
  reset: "Password updated. Sign in with your new password.",
  oauth: "We couldn't finish signing you in with that provider. Try again, or use your email and password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; session?: string; reset?: string }>;
}) {
  // The real check, not the proxy's optimistic one: a signed-in visitor belongs on the board.
  if (await getOptionalSession()) redirect("/board");

  const { error, session, reset } = await searchParams;
  const notice =
    session === "ended"
      ? NOTICES.ended
      : reset === "1"
        ? NOTICES.reset
        : error
          ? (NOTICES[error] ?? null)
          : null;
  return (
    <AuthForm
      mode="login"
      action={signInAction}
      resendAction={resendVerificationAction}
      notice={notice}
    >
      <SocialSignIn providers={enabledSocialProviders(process.env)} />
    </AuthForm>
  );
}
