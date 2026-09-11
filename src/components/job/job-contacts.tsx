"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";

import { useJobContactLinks } from "@/components/contacts/contacts-provider";
import { LinkContactDialog } from "@/components/job/link-contact-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { kindLine } from "@/lib/contacts";
import { pluralize, type Job } from "@/lib/jobs";

/**
 * The job page's Contacts card (ticket 13): one row per linked Contact — name, kind · agency,
 * email, and "Also on N other jobs →" — with linking search-first so the same person is never
 * saved twice. Full editing happens on the Contact's own page.
 */
export function ContactsCard({ job }: { job: Job }) {
  const links = useJobContactLinks(job.id);
  const [open, setOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  return (
    <Card
      role="region"
      aria-labelledby="contacts-heading"
      className="[--card-spacing:--spacing(5)]"
    >
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id="contacts-heading">Contacts</h2>
        </CardTitle>
        <CardAction>
          {/* Explicit label: an adjacent sr-only span would concatenate into "Addcontact". */}
          <Button
            ref={addButton}
            variant="ghost"
            size="sm"
            aria-label="Add contact"
            onClick={() => setOpen(true)}
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {links.error && !open && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm"
          >
            <span>{links.error}</span>
            <Button variant="outline" size="sm" onClick={links.dismissError}>
              Dismiss
            </Button>
          </div>
        )}

        {job.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contacts saved. Add the recruiter or hiring manager once you have a name.
          </p>
        ) : (
          <ul className="space-y-3">
            {job.contacts.map((contact) => (
              <li
                key={contact.id}
                className="relative rounded-md border border-border px-3 py-2.5 pr-10"
              >
                <p className="font-bold">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {contact.name}
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">{kindLine(contact)}</p>
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="mt-0.5 inline-block max-w-full truncate rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {contact.email}
                  </a>
                )}
                {contact.otherJobCount > 0 && (
                  <p className="mt-1 text-sm">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      Also on {pluralize(contact.otherJobCount, "other job")}
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 text-muted-foreground"
                  disabled={links.pending}
                  aria-label={`Remove ${contact.name} from this job`}
                  onClick={() => links.unlink(contact.id)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <LinkContactDialog
        open={open}
        onOpenChange={setOpen}
        linkedIds={job.contacts.map((contact) => contact.id)}
        links={links}
        returnFocusTo={addButton}
      />
    </Card>
  );
}
