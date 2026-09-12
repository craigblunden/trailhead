"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { AddContact } from "@/components/contacts/add-contact";
import { useContactList } from "@/components/contacts/contacts-provider";
import { BrandLogo } from "@/components/brand-logo";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { kindLine } from "@/lib/contacts";
import { pluralize } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * `/contacts` is master-detail on wide screens and list → detail on narrow ones (ticket 13). The
 * list lives in the layout, so moving between contacts keeps it in place; below `lg` whichever
 * half is not the point of the current URL is hidden. The add card goes with the list: above it
 * until `xl`, and in its own column on the right from there, as the documents page’s upload card.
 */
export function ContactsShell({ children }: { children: React.ReactNode }) {
  const selectedId = useSelectedLayoutSegment();
  const contacts = useContactList();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />

      <PageMain>
        <div className={cn("mb-6", selectedId && "hidden lg:block")}>
          <h1 id="contacts-list-heading" className="text-3xl tracking-tight">
            Contacts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The people in your search, each linked to every role they’re part of.
          </p>
        </div>

        {/* grid-cols-1 at the base: without it the phone-width track sizes to the widest
            unbreakable line and widens every card (ticket 13). */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
          {/* One column until `xl`; from there `contents` lets the card and the list take their
              own columns, each in the first row, so neither is pushed down by the detail’s height. */}
          <div className={cn("space-y-6 xl:contents xl:space-y-0", selectedId && "hidden lg:block")}>
            <AddContact className="xl:col-start-3 xl:row-start-1" />

            <section aria-labelledby="contacts-list-heading" className="xl:col-start-1 xl:row-start-1">

              {contacts.isPending ? (
                <LoadingTrail>Loading your contacts…</LoadingTrail>
              ) : contacts.isError ? (
                <div role="alert" className="rounded-md border border-dashed border-border p-4 text-sm">
                  <p>We couldn’t load your contacts.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => contacts.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : contacts.data.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <h2 className="text-lg">No contacts yet</h2>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                    Save the recruiters, hiring managers, and referrers you meet — here, or from any
                    job’s Contacts card.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {contacts.data.map((contact) => {
                    const current = contact.id === selectedId;
                    return (
                      <li key={contact.id}>
                        <Link
                          href={`/contacts/${contact.id}`}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "block rounded-md bg-card px-3 py-2.5 ring-1 ring-foreground/10 outline-none hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
                            current && "ring-2 ring-primary/60",
                          )}
                        >
                          <span className="block font-bold">{contact.name}</span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {kindLine(contact)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {contact.jobCount === 0
                              ? "Not on any role yet"
                              : `On ${pluralize(contact.jobCount, "role")}`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className={cn("min-w-0 xl:col-start-2 xl:row-start-1", !selectedId && "hidden lg:block")}>
            {children}
          </div>
        </div>
      </PageMain>
    </div>
  );
}
