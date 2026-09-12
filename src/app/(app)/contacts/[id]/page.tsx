import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { ContactDetailView, ContactMissing } from "@/components/contacts/contact-detail-view";
import { PageArrive } from "@/components/page-transition";
import { contactsCache } from "@/lib/contacts-client";
import { requirePageSession } from "@/server/auth/session";
import { getContact } from "@/server/data/contacts";
import { prefetch } from "@/server/prefetch";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  const contact = await getContact(id);
  // An unknown id and another user's id render the same page, with the same status.
  if (!contact) {
    return (
      <PageArrive>
        <ContactMissing />
      </PageArrive>
    );
  }

  const state = await prefetch(async (queryClient) => {
    queryClient.setQueryData(contactsCache.detailKey(id), contact);
  });
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <ContactDetailView contactId={id} />
      </HydrationBoundary>
    </PageArrive>
  );
}
