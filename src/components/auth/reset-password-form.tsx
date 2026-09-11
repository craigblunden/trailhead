"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import type { AuthState } from "@/server/auth/actions";

type Props = {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

const IDLE: AuthState = { status: "idle" };

/** Sets a new password for the session a reset link created. Same minimum as sign-up. */
export function ResetPasswordForm({ action }: Props) {
  const fieldId = useId();
  const [state, submit, pending] = useActionState(action, IDLE);
  const passwordError = state.status === "error" ? state.fields?.password : undefined;

  return (
    <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
      <h1 className="text-2xl tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&rsquo;ll sign in with it from now on.
      </p>

      {state.status === "error" && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <form action={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-password`}>New password</Label>
          <Input
            id={`${fieldId}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={PASSWORD_MIN_LENGTH}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={
              [passwordError ? `${fieldId}-password-error` : null, `${fieldId}-password-hint`]
                .filter(Boolean)
                .join(" ")
            }
            className="h-11"
          />
          <p id={`${fieldId}-password-hint`} className="text-xs text-muted-foreground">
            At least {PASSWORD_MIN_LENGTH} characters.
          </p>
          {passwordError && (
            <p id={`${fieldId}-password-error`} className="text-xs text-destructive">
              {passwordError}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="h-11 w-full text-base">
          {pending ? "Updating…" : "Update password"}
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {pending ? "Updating your password…" : ""}
        </p>
      </form>
    </div>
  );
}
