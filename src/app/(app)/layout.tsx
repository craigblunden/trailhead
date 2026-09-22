import { ContactsProvider } from "@/components/contacts/contacts-provider";
import { DocumentsProvider } from "@/components/documents/documents-provider";
import { Providers } from "@/components/providers";
import { SectionScene } from "@/components/section-scene";
import { SessionProvider } from "@/components/session-provider";
import { TermsGate } from "@/components/terms/terms-gate";
import { TrailScene } from "@/components/trail-scene";
import { TERMS_VERSION } from "@/lib/terms";
import { acceptTermsAction } from "@/server/actions/terms";
import { signOutAction } from "@/server/auth/actions";
import { getOptionalSession } from "@/server/auth/session";
import { currentPlan } from "@/server/data/plans";
import { hasAcceptedCurrentTerms } from "@/server/data/terms";

/**
 * The signed-in application's shared layout: the query client, the contacts client, and the
 * signed-in user and their Plan for the header. It does NOT gate authentication: layouts do not
 * re-render on client-side navigation, so a check here would not be evaluated on every route change.
 * Pages call `requirePageSession()` and the data layer calls `requireSession()`; reading the user
 * here is for display only.
 *
 * It does gate **terms acceptance** (terms ticket 04; **ADR-0008**), and that one is safe to site
 * here for the same reason: a session with no acceptance of `TERMS_VERSION` cannot have rendered this
 * layout's children in the first place, so there is nothing behind it to navigate between. When the
 * gate is up, `children` is never rendered — a page component under it is not called, and no page's
 * data is read. Accepting revalidates this layout, which is what takes it down.
 *
 * The gate is also the backfill: an Account created before the terms existed has no acceptance row,
 * which is the same answer as one that accepted an earlier version, so it meets the same step on its
 * next visit. There is no one-off migration.
 *
 * The sky-to-meadow wash and the landscape beneath the pages are here too, so they stay in place
 * while the pages change (see `SectionScene`). A page that wants a plain background paints its own.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const user = session
    ? { name: session.name, email: session.email, plan: await currentPlan() }
    : null;
  // Only a signed-in visitor can be gated: with no session the pages below redirect to sign-in,
  // which is a better answer than a terms page for someone who is not signed in.
  const gated = session ? !(await hasAcceptedCurrentTerms()) : false;

  return (
    <SessionProvider user={user}>
      <Providers>
        <ContactsProvider>
          <DocumentsProvider>
            <div className="scene-wash flex flex-1 flex-col">
              {gated ? (
                <TermsGate version={TERMS_VERSION} accept={acceptTermsAction} signOut={signOutAction} />
              ) : (
                children
              )}
              <SectionScene>
                <TrailScene variant="trail" />
              </SectionScene>
            </div>
          </DocumentsProvider>
        </ContactsProvider>
      </Providers>
    </SessionProvider>
  );
}
