"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import { parseInput, type FieldErrors } from "@/server/validation";

import { createServerSupabase } from "./supabase";

export type AuthState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: FieldErrors }
  /** Sign-up accepted — the same state whether or not the address already had an account. */
  | { status: "check-email"; email: string }
  /** Sign-in refused because the address is not verified yet. */
  | { status: "unverified"; email: string }
  | { status: "resent"; email: string }
  /** Reset requested — the same state whether or not the address has an account. */
  | { status: "sent"; email: string };

const email = z.string().trim().toLowerCase().min(1, "Enter your email").max(254).pipe(
  z.email("Enter a valid email address"),
);
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, "Use at most 72 characters");

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email,
  password,
});
const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password") });
const emailOnlySchema = z.object({ email });

const GENERIC_FAILURE = "Something went wrong on our side. Please try again in a moment.";

/** The origin the confirmation link should come back to. */
async function appOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "127.0.0.1:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function formFields(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries()).filter(([key]) => !key.startsWith("$")),
  );
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parseInput(signUpSchema, formFields(formData));
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", fields: parsed.errors };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${await appOrigin()}/auth/confirm`,
    },
  });

  // Do not leak whether the address is registered. Auth already returns an obfuscated success for
  // a known address when confirmations are on; if a deployment ever reports it as an error, the
  // user still sees exactly what a new address sees.
  if (error && !/already|registered|exists/i.test(error.message)) {
    return { status: "error", message: GENERIC_FAILURE };
  }
  return { status: "check-email", email: parsed.data.email };
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parseInput(signInSchema, formFields(formData));
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", fields: parsed.errors };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (/not confirmed/i.test(error.message)) {
      return { status: "unverified", email: parsed.data.email };
    }
    if (/invalid/i.test(error.message)) {
      return { status: "error", message: "That email and password don't match." };
    }
    return { status: "error", message: GENERIC_FAILURE };
  }
  redirect("/board");
}

export async function resendVerificationAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = parseInput(emailOnlySchema, formFields(formData));
  if (!parsed.ok) return { status: "error", message: "Enter a valid email address." };

  const supabase = await createServerSupabase();
  await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await appOrigin()}/auth/confirm` },
  });
  // Same response whether or not a mail went out: no enumeration through the resend path either.
  return { status: "resent", email: parsed.data.email };
}

/**
 * Always the same confirmation. "No account with that email" would be a lookup service; the
 * response and the rendering depend only on what was typed.
 */
export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = parseInput(emailOnlySchema, formFields(formData));
  if (!parsed.ok) return { status: "error", message: "Enter a valid email address.", fields: parsed.errors };

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appOrigin()}/auth/confirm`,
  });
  return { status: "sent", email: parsed.data.email };
}

/**
 * Sets the password for the session the recovery link created, then ends that session so the
 * user signs in with the new password like any other day — which is also the proof that it took.
 */
export async function updatePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parseInput(z.object({ password }), formFields(formData));
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", fields: parsed.errors };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/same|different from the old/i.test(error.message)) {
      return { status: "error", message: "Choose a password you haven't used before." };
    }
    if (/session|not logged in|jwt/i.test(error.message)) {
      redirect("/forgot-password?error=session");
    }
    return { status: "error", message: GENERIC_FAILURE };
  }
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}

/** A mutation, so a submit control rather than a link, and never during render. */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
