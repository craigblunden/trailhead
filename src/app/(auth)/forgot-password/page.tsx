import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { requestPasswordResetAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Reset your password" };

const NOTICES: Record<string, string> = {
  link: "That reset link has expired or was already used. Request a fresh one below.",
  session: "That reset link didn't work or has expired. Request a fresh one below.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <ForgotPasswordForm
      action={requestPasswordResetAction}
      notice={error ? (NOTICES[error] ?? null) : null}
    />
  );
}
