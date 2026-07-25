import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Contact } from "@/lib/jobs";

export function ContactsCard({ contacts }: { contacts: Contact[] }) {
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
          {/* Adding contacts needs somewhere to persist them. Disabled rather
              than enabled-and-inert, so the control does not lie. */}
          {/* Explicit label: an adjacent sr-only span would concatenate into
              "Addcontact", since JSX strips its leading space. */}
          <Button
            variant="ghost"
            size="sm"
            disabled
            aria-label="Add contact (coming soon)"
            className="text-muted-foreground"
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contacts saved. Add the recruiter or hiring manager once you have
            a name.
          </p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="rounded-md border border-border px-3 py-2.5"
              >
                <p className="font-bold">{contact.name}</p>
                <p className="text-sm text-muted-foreground">{contact.title}</p>
                <a
                  href={`mailto:${contact.email}`}
                  className="mt-0.5 inline-block rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {contact.email}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
