import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { resendVerificationAction, signInAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or create a new account to get a fresh one.",
  ended: "Your session has ended. Sign in again to pick up where you left off.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; session?: string }>;
}) {
  // The real check, not the proxy's optimistic one: a signed-in visitor belongs on the board.
  if (await getOptionalSession()) redirect("/board");

  const { error, session } = await searchParams;
  const notice = session === "ended" ? NOTICES.ended : error ? (NOTICES[error] ?? null) : null;
  return (
    <AuthForm
      mode="login"
      action={signInAction}
      resendAction={resendVerificationAction}
      notice={notice}
    />
  );
}
