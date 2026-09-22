import { SiteHeader } from "@/components/landing/header";
import { SiteFooter } from "@/components/site-footer";
import { TrailScene } from "@/components/trail-scene";

/**
 * The public disclosure pages — `/terms` and `/privacy` (terms tickets 01, 02). Their own group
 * because they are the only routes in this product with no session on either side of them: a visitor
 * reads them before signing up, and a Tenant reads them from the acceptance gate. Nothing here calls
 * `requirePageSession()`, and nothing here reads a Tenant's data.
 *
 * The site's header and the same `TrailScene` the landing page closes on, so a page of terms still
 * looks like this product rather than a legal appendix bolted to the side of it.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="scene-wash flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">{children}</main>
      <TrailScene variant="hero" />
      <SiteFooter />
    </div>
  );
}
