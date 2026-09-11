"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SocialProvider, SocialProviderId } from "@/lib/social-providers";
import { startSocialSignIn } from "@/lib/social-sign-in-client";

type SocialSignInProps = {
  /** The providers this deployment has credentials for. Empty renders nothing. */
  providers: readonly SocialProvider[];
  /** Starts the OAuth redirect. Replaced in tests; the default leaves for the provider. */
  startSignIn?: (provider: SocialProviderId) => Promise<void>;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.9 18.3 5.2 18.3 5.2c.7 1.6.3 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

const MARKS: Record<SocialProviderId, () => React.JSX.Element> = {
  google: GoogleMark,
  github: GitHubMark,
};

/**
 * "Continue with Google / GitHub", for both `/login` and `/signup` — the provider decides whether
 * the account is new, so the two pages offer the same buttons. Renders nothing when the deployment
 * has no provider credentials, which is what keeps a clean clone working.
 */
export function SocialSignIn({ providers, startSignIn = startSocialSignIn }: SocialSignInProps) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [failed, setFailed] = useState<SocialProvider | null>(null);

  // Coming back from the provider with the Back button restores this page from the bfcache with
  // the buttons still disabled; hand them back.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (providers.length === 0) return null;

  async function begin(provider: SocialProvider) {
    setFailed(null);
    setPending(provider);
    try {
      await startSignIn(provider.id);
    } catch {
      setPending(null);
      setFailed(provider);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        or
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4 space-y-2">
        {providers.map((provider) => {
          const Mark = MARKS[provider.id];
          return (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => begin(provider)}
              className="h-11 w-full gap-2 text-base"
            >
              <Mark />
              Continue with {provider.label}
            </Button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="mt-2 text-center text-xs text-muted-foreground">
        {pending ? `Taking you to ${pending.label}…` : ""}
      </p>
      {failed && (
        <p role="alert" className="mt-2 rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {`We couldn't reach ${failed.label}. Try again, or use your email.`}
        </p>
      )}
    </div>
  );
}
