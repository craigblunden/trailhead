import { ContactsProvider } from "@/components/contacts/contacts-provider";
import { DocumentsProvider } from "@/components/documents/documents-provider";
import { Providers } from "@/components/providers";
import { SessionProvider } from "@/components/session-provider";
import { getOptionalSession } from "@/server/auth/session";

/**
 * The signed-in application's shared layout: the query client, the contacts client, and the
 * signed-in user for the header. It does NOT gate anything: layouts do not re-render on
 * client-side navigation, so a check here would not be evaluated on every route change. Pages
 * call `requirePageSession()` and the data layer calls `requireSession()`; reading the user here
 * is for display only.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const user = session ? { name: session.name, email: session.email } : null;

  return (
    <SessionProvider user={user}>
      <Providers>
        <ContactsProvider>
          <DocumentsProvider>{children}</DocumentsProvider>
        </ContactsProvider>
      </Providers>
    </SessionProvider>
  );
}
