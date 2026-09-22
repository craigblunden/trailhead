"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { AI_PROVIDERS, FILES_ARE_NEVER_SENT, formatTermsDate, providerSummary } from "@/lib/terms";
import type { ActionResult } from "@/server/action-result";

/**
 * The acceptance step every authenticated route sits behind (terms ticket 04; **ADR-0008**). Rendered
 * by the `(app)` layout in place of its children, so a session with no acceptance of the current
 * version reaches this and nothing else — one place, rather than a check each route remembers.
 *
 * The control is **explicit, unticked, and blocks submitting**. Not "by continuing you agree": the
 * whole point is surfacing which text goes to which AI company, and an implicit line surfaces nothing
 * and records nothing.
 *
 * The two pages open in a new tab, so reading them does not lose the place the person was going. The
 * only alternative to accepting is signing out, which is the honest consequence of a gate.
 */
export function TermsGate({
  version,
  accept,
  signOut,
}: {
  version: string;
  /** Records the acceptance. The action itself, passed in, so a component test can stand in for it. */
  accept: () => Promise<ActionResult<null>>;
  /** The ordinary sign-out action: declining leads here and nowhere else. */
  signOut: () => Promise<void>;
}) {
  const router = useRouter();
  const agreeId = useId();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await accept().catch(() => null);
    if (result?.ok) {
      // The layout does not re-render on a client-side navigation, so ask for it explicitly: the
      // acceptance is recorded, and this component should not still be the thing on screen.
      router.refresh();
      return;
    }
    setSaving(false);
    setError(
      result && !result.ok
        ? result.message
        : "We couldn’t record that. Check your connection and try again.",
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <BrandLogo href="/" size="lg" />

      <main className="mt-8 w-full max-w-xl">
        <h1 className="text-3xl leading-tight tracking-tight text-balance sm:text-4xl">
          Before you carry on
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {BRAND_NAME} sends some of your text to two AI companies to write letters, run interviews,
          and score your footing on a job. Here is what that means, in short.
        </p>

        <section
          aria-labelledby="gate-summary-heading"
          className="mt-6 rounded-lg bg-card p-5 ring-1 ring-foreground/10"
        >
          <h2 id="gate-summary-heading" className="font-sans text-sm font-bold">
            What is sent, and to whom
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
            {AI_PROVIDERS.map((provider) => (
              <li key={provider.name}>{providerSummary(provider)}</li>
            ))}
            <li>{FILES_ARE_NEVER_SENT}</li>
            <li>
              Nothing is sold, nothing is advertised against, and no other account can read any of it.
            </li>
          </ul>
          <p className="mt-4 text-sm">
            The full detail — what each company commits to, quoted, and how long they keep it — is on
            the privacy page.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <ReadLink href="/terms">Read the terms</ReadLink>
            <ReadLink href="/privacy">Read the privacy page</ReadLink>
          </div>
        </section>

        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-start gap-3">
          <input
            id={agreeId}
            type="checkbox"
            checked={agreed}
            disabled={saving}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <label htmlFor={agreeId} className="text-sm leading-relaxed">
            I have read the terms and the privacy page, and I agree to them, including what is sent to
            the AI companies named above.
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-10 px-5"
            disabled={!agreed || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Agree and continue"}
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="h-10 px-4" disabled={saving}>
              Sign out instead
            </Button>
          </form>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          This is version <time dateTime={version}>{formatTermsDate(version)}</time>. If what is sent
          ever changes, you will be asked again — and nothing else about your account changes in the
          meantime.
        </p>
      </main>
    </div>
  );
}

/** A link out to a disclosure page. A new tab, so reading it does not lose where the person was going. */
function ReadLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 underline underline-offset-4"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only">, opens in a new tab</span>
    </Link>
  );
}
