import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { TrailScene } from "@/components/trail-scene";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="scene-wash flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center sm:py-28">
          <p className="text-xs font-bold tracking-[0.18em] text-eyebrow uppercase">
            Your job search, mapped
          </p>
          <h1 className="mt-5 text-5xl leading-[1.05] font-normal tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Every application, one trail.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">
            Track every role from first spark to signed offer — with the resume you
            used, the posting link, and the details that matter, all in one basecamp.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 px-6 text-base">
              <Link href="/signup">Start tracking — it&rsquo;s free</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6 text-base">
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>
      </main>

      <TrailScene variant="hero" />
    </div>
  );
}
