import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { resendVerificationAction, signUpAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getOptionalSession()) redirect("/board");

  return (
    <AuthForm mode="signup" action={signUpAction} resendAction={resendVerificationAction} />
  );
}
