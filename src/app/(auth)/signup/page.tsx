import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { enabledSocialProviders } from "@/lib/social-providers";
import { resendVerificationAction, signUpAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getOptionalSession()) redirect("/board");

  return (
    <AuthForm mode="signup" action={signUpAction} resendAction={resendVerificationAction}>
      {/* The provider decides whether the account is new, so sign-up offers the same buttons. */}
      <SocialSignIn providers={enabledSocialProviders(process.env)} />
    </AuthForm>
  );
}
