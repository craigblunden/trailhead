import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { updatePasswordAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Reached from a recovery link, which signs the user in on the way here. With no session there is
 * nothing to update — the link was bad or expired — so the visitor goes back to request another.
 */
export default async function ResetPasswordPage() {
  if (!(await getOptionalSession())) redirect("/forgot-password?error=session");

  return <ResetPasswordForm action={updatePasswordAction} />;
}
