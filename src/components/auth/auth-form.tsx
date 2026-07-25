"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = { mode: "signup" | "login" };

const COPY = {
  signup: {
    title: "Create your account",
    subtitle: "Start tracking your job search in one place.",
    submit: "Create account",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
  login: {
    title: "Welcome back",
    subtitle: "Pick up your trail where you left off.",
    submit: "Sign in",
    switchPrompt: "New to Trailhead?",
    switchLabel: "Create an account",
    switchHref: "/signup",
  },
} as const;

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const [pending, setPending] = useState(false);
  const copy = COPY[mode];

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // No auth backend yet — this walks the prototype through to the board.
    setPending(true);
    router.push("/board");
  }

  return (
    <div className="rounded-lg bg-card p-7 ring-1 ring-foreground/10">
      <h1 className="text-2xl tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-name`}>Full name</Label>
            <Input
              id={`${fieldId}-name`}
              name="name"
              autoComplete="name"
              placeholder="Sam Rivera"
              required
              className="h-11"
            />
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
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-password`}>Password</Label>
          <Input
            id={`${fieldId}-password`}
            name="password"
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder="••••••••"
            required
            minLength={8}
            aria-describedby={
              mode === "signup" ? `${fieldId}-password-hint` : undefined
            }
            className="h-11"
          />
          {mode === "signup" && (
            <p
              id={`${fieldId}-password-hint`}
              className="text-xs text-muted-foreground"
            >
              At least 8 characters.
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="h-11 w-full text-base">
          {pending ? "One moment…" : copy.submit}
        </Button>
      </form>

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
