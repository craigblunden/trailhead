"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { useContactList } from "@/components/contacts/contacts-provider";
import { TrailheadLogo } from "@/components/trailhead-logo";
import { Button } from "@/components/ui/button";
import { kindLine } from "@/lib/contacts";
import { pluralize } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * `/contacts` is master-detail on wide screens and list → detail on narrow ones (ticket 13). The
 * list lives in the layout, so moving between contacts keeps it in place; below `lg` whichever
 * half is not the point of the current URL is hidden.
 */
export function ContactsShell({ children }: { children: React.ReactNode }) {
  const selectedId = useSelectedLayoutSegment();
  const contacts = useContactList();
  const [addOpen, setAddOpen] = useState(false);
  const addTrigger = useRef<HTMLElement | null>(null);

  function openAdd(event: React.MouseEvent<HTMLButtonElement>) {
    addTrigger.current = event.currentTarget;
    setAddOpen(true);
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader
        leading={<TrailheadLogo href="/board" />}
        actions={
          <Button className="h-9 px-3.5" onClick={openAdd}>
            <Plus aria-hidden="true" />
            Add contact
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {/* grid-cols-1 at the base: without it the phone-width track sizes to the widest
            unbreakable line and widens every card (ticket 13). */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <section
            aria-labelledby="contacts-list-heading"
            className={cn(selectedId && "hidden lg:block")}
          >
            <h1 id="contacts-list-heading" className="text-3xl tracking-tight">
              Contacts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The people in your search, each linked to every role they’re part of.
            </p>

            {contacts.isPending ? (
              <p role="status" className="mt-6 text-sm text-muted-foreground">
                Loading your contacts…
              </p>
            ) : contacts.isError ? (
              <div role="alert" className="mt-6 rounded-md border border-dashed border-border p-4 text-sm">
                <p>We couldn’t load your contacts.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => contacts.refetch()}>
                  Try again
                </Button>
              </div>
            ) : contacts.data.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-10 text-center">
                <h2 className="text-lg">No contacts yet</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                  Save the recruiters, hiring managers, and referrers you meet — here, or from any
                  job’s Contacts card.
                </p>
                <Button className="mt-5 h-10 px-4" onClick={openAdd}>
                  <Plus aria-hidden="true" />
                  Add contact
                </Button>
              </div>
            ) : (
              <ul className="mt-6 space-y-2">
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

          <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>{children}</div>
        </div>
      </main>

      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} returnFocusTo={addTrigger} />
    </div>
  );
}
