import Link from "next/link";

import { TrailheadLogo } from "@/components/trailhead-logo";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="w-full">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <TrailheadLogo href="/" />
        <nav aria-label="Account" className="flex items-center gap-2">
          {/* The hero repeats this link, so it can drop away on tiny screens
              rather than crowding the wordmark. */}
          <Button
            asChild
            variant="outline"
            className="hidden h-9 px-4 sm:inline-flex bg-none"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="h-9 px-4">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
