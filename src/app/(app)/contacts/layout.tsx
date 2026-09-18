import { HydrationBoundary } from "@tanstack/react-query";

import { ContactsShell } from "@/components/contacts/contacts-shell";
import { contactsCache } from "@/lib/contacts-client";
import { getOptionalSession } from "@/server/auth/session";
import { listContacts } from "@/server/data/contacts";
import { ignore, prefetch } from "@/server/prefetch";

/**
 * The contact list sits in the layout so it stays put while the user moves between contacts.
 * The list is prefetched only when there is a session to read it with; the pages beneath decide
 * who may see them.
 */
export default async function ContactsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const state = session
    ? await prefetch((queryClient) => queryClient.query(contactsCache.listOptions(listContacts)).catch(ignore))
    : undefined;

  return (
    <HydrationBoundary state={state}>
      <ContactsShell>{children}</ContactsShell>
    </HydrationBoundary>
  );
}
