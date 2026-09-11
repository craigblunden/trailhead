"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import type { AuthState } from "@/server/auth/actions";

type AuthAction = (state: AuthState, formData: FormData) => Promise<AuthState>;

type AuthFormProps = {
  mode: "signup" | "login";
  /** The Server Action that handles the submit. */
  action: AuthAction;
  /** Sends another verification mail; used by the unverified and check-email states. */
  resendAction: AuthAction;
  /** A message to open with — e.g. after a bad verification link. */
  notice?: string | null;
  /** Rendered between the form and the switch link — social sign-in buttons (ticket 07). */
  children?: React.ReactNode;
};

const COPY = {
  signup: {
    title: "Create your account",
    subtitle: "Start tracking your job search in one place.",
    submit: "Create account",
    pending: "Creating your account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
  login: {
    title: "Welcome back",
    subtitle: "Pick up your trail where you left off.",
    submit: "Sign in",
    pending: "Signing you in…",
    switchPrompt: "New to Trailhead?",
    switchLabel: "Create an account",
    switchHref: "/signup",
  },
} as const;

const IDLE: AuthState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** "We've sent a link" — identical whether or not the address was already registered. */
function CheckEmail({
  email,
  resendAction,
}: {
  email: string;
  resendAction: AuthAction;
}) {
  const [state, resend, pending] = useActionState(resendAction, IDLE);
  return (
    <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
      <h1 className="text-2xl tracking-tight">Check your email</h1>
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        We sent a verification link to <strong className="text-foreground">{email}</strong>.
        Follow it to finish creating your account.
      </p>
      <form action={resend} className="mt-6">
        <input type="hidden" name="email" value={email} />
        <p className="text-sm text-muted-foreground">Didn&rsquo;t get it?</p>
        <Button type="submit" variant="outline" disabled={pending} className="mt-2 h-10 px-4">
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
        <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {state.status === "resent" && "Sent. Give it a minute, and check your spam folder too."}
          {state.status === "error" && state.message}
        </p>
      </form>
    </div>
  );
}

export function AuthForm({ mode, action, resendAction, notice, children }: AuthFormProps) {
  const fieldId = useId();
  const copy = COPY[mode];
  const [state, submit, pending] = useActionState(action, IDLE);

  if (state.status === "check-email") {
    return <CheckEmail email={state.email} resendAction={resendAction} />;
  }

  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  const describedBy = (field: string, hintId?: string) =>
    [fields[field] ? `${fieldId}-${field}-error` : null, hintId].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
      <h1 className="text-2xl tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>

      {notice && (
        <p role="status" className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {state.status === "unverified" ? (
        <div role="alert" className="mt-4 rounded-md border border-border bg-muted/60 px-3 py-3 text-sm">
          <p>
            <strong>{state.email}</strong> hasn&rsquo;t been verified yet. Follow the link in the
            email we sent, then sign in.
          </p>
          <ResendInline email={state.email} resendAction={resendAction} />
        </div>
      ) : (
        state.status === "error" && (
          <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {state.message}
          </p>
        )
      )}

      <form action={submit} noValidate={false} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-name`}>Full name</Label>
            <Input
              id={`${fieldId}-name`}
              name="name"
              autoComplete="name"
              placeholder="Sam Rivera"
              required
              aria-invalid={fields.name ? true : undefined}
              aria-describedby={describedBy("name")}
              className="h-11"
            />
            <FieldError id={`${fieldId}-name-error`} message={fields.name} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-email`}>Email</Label>
          <Input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            aria-invalid={fields.email ? true : undefined}
            aria-describedby={describedBy("email")}
            className="h-11"
          />
          <FieldError id={`${fieldId}-email-error`} message={fields.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-password`}>Password</Label>
          <Input
            id={`${fieldId}-password`}
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="••••••••"
            required
            minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : undefined}
            aria-invalid={fields.password ? true : undefined}
            aria-describedby={describedBy(
              "password",
              mode === "signup" ? `${fieldId}-password-hint` : undefined,
            )}
            className="h-11"
          />
          {mode === "signup" && (
            <p id={`${fieldId}-password-hint`} className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
          <FieldError id={`${fieldId}-password-error`} message={fields.password} />
        </div>

        {mode === "login" && (
          <p className="text-sm">
            <Link
              href="/forgot-password"
              className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Forgot your password?
            </Link>
          </p>
        )}

        <Button type="submit" disabled={pending} className="h-11 w-full text-base">
          {pending ? copy.pending : copy.submit}
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {pending ? copy.pending : ""}
        </p>
      </form>

      {children}

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {copy.switchPrompt}{" "}
        <Link
          href={copy.switchHref}
          className="rounded-sm font-bold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}

function ResendInline({ email, resendAction }: { email: string; resendAction: AuthAction }) {
  const [state, resend, pending] = useActionState(resendAction, IDLE);
  return (
    <form action={resend} className="mt-3">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
      <span role="status" aria-live="polite" className="ml-3 text-xs text-muted-foreground">
        {state.status === "resent" && "Sent."}
        {state.status === "error" && state.message}
      </span>
    </form>
  );
}
