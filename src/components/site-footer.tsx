import Link from "next/link";

import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Where `/terms` and `/privacy` are reachable from without a session (terms ticket 01). The landing
 * page and the two disclosure pages carry it; the auth pages carry the same two links inline, under
 * the form, where someone deciding whether to sign up is actually looking.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("w-full border-t border-foreground/10", className)}>
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <p>{BRAND_NAME} — see what&rsquo;s working in your job search.</p>
        <LegalLinks />
      </div>
    </footer>
  );
}

/** The same two links, as a line rather than a bar: under an auth form, and on the account page. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn("flex items-center justify-center gap-5 text-sm text-muted-foreground", className)}
    >
      <Link href="/terms" className="underline underline-offset-4">
        Terms
      </Link>
      <Link href="/privacy" className="underline underline-offset-4">
        Privacy
      </Link>
    </nav>
  );
}
