"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/server/auth/actions";

type Props = {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  notice?: string | null;
};

const IDLE: AuthState = { status: "idle" };

/**
 * Requests a reset link. The confirmation it renders depends only on what was typed: a registered
 * and an unregistered address produce the same screen, so this form is not a lookup service.
 */
export function ForgotPasswordForm({ action, notice }: Props) {
  const fieldId = useId();
  const [state, submit, pending] = useActionState(action, IDLE);

  if (state.status === "sent") {
    return (
      <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
        <h1 className="text-2xl tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          If <strong className="text-foreground">{state.email}</strong> has a Trailhead account, a
          link to choose a new password is on its way. It expires in an hour.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link
            href="/login"
            className="rounded-sm font-bold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  const emailError = state.status === "error" ? state.fields?.email : undefined;

  return (
    <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
      <h1 className="text-2xl tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your email and we&rsquo;ll send a link to choose a new one.
      </p>

      {notice && (
        <p role="status" className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <form action={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-email`}>Email</Label>
          <Input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${fieldId}-email-error` : undefined}
            className="h-11"
          />
          {emailError && (
            <p id={`${fieldId}-email-error`} className="text-xs text-destructive">
              {emailError}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="h-11 w-full text-base">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {pending ? "Sending your reset link…" : ""}
        </p>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="rounded-sm font-bold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
