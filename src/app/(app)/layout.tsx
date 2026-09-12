import { ContactsProvider } from "@/components/contacts/contacts-provider";
import { DocumentsProvider } from "@/components/documents/documents-provider";
import { Providers } from "@/components/providers";
import { SectionScene } from "@/components/section-scene";
import { SessionProvider } from "@/components/session-provider";
import { TrailScene } from "@/components/trail-scene";
import { getOptionalSession } from "@/server/auth/session";
import { currentPlan } from "@/server/data/plans";

/**
 * The signed-in application's shared layout: the query client, the contacts client, and the
 * signed-in user and their Plan for the header. It does NOT gate anything: layouts do not re-render on
 * client-side navigation, so a check here would not be evaluated on every route change. Pages
 * call `requirePageSession()` and the data layer calls `requireSession()`; reading the user here
 * is for display only.
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

  return (
    <SessionProvider user={user}>
      <Providers>
        <ContactsProvider>
          <DocumentsProvider>
            <div className="scene-wash flex flex-1 flex-col">
              {children}
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
