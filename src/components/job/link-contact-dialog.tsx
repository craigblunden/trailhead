"use client";

import { useId, useState } from "react";
import { Plus, UserPlus } from "lucide-react";

import { ContactKindSelect } from "@/components/contacts/contact-kind-select";
import { useContactList, type useJobContactLinks } from "@/components/contacts/contacts-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTACT_LIMITS,
  DEFAULT_CONTACT_KIND,
  kindLine,
  matchesContact,
  type ContactKind,
} from "@/lib/contacts";
import { pluralize } from "@/lib/jobs";

type LinkContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contacts already on this Job, which the search leaves out. */
  linkedIds: string[];
  links: ReturnType<typeof useJobContactLinks>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

/** More than this and the user should type a little more; the list stays scannable. */
const MAX_RESULTS = 8;

/**
 * Search-first linking (ticket 13). Searching before creating is what prevents duplicate Contacts,
 * which is the whole point of Contacts belonging to the user. "Create “name”" is always the last
 * option, and creating from a Job asks only for name and kind.
 */
export function LinkContactDialog({
  open,
  onOpenChange,
  linkedIds,
  links,
  returnFocusTo,
}: LinkContactDialogProps) {
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ContactKind>(DEFAULT_CONTACT_KIND);
  const contacts = useContactList({ enabled: open });

  function close() {
    links.dismissError();
    setQuery("");
    setCreating(false);
    setKind(DEFAULT_CONTACT_KIND);
    onOpenChange(false);
  }

  const term = query.trim().toLowerCase();
  const candidates = (contacts.data ?? []).filter((contact) => !linkedIds.includes(contact.id));
  const matches = candidates.filter((contact) => matchesContact(contact, term));
  const shown = matches.slice(0, MAX_RESULTS);
  const exactName = (contacts.data ?? []).some((contact) => contact.name.toLowerCase() === term);

  let status: string;
  if (contacts.isPending) status = "Loading your contacts…";
  else if (contacts.isError) status = "We couldn’t load your contacts. You can still create one.";
  else if (term) status = matches.length === 0 ? "No matching contacts." : `${pluralize(matches.length, "match")}.`;
  else if (candidates.length === 0) status = "No other saved contacts yet. Type a name to create one.";
  else status = `${pluralize(candidates.length, "saved contact")} to choose from.`;

  async function linkExisting(contactId: string) {
    if (await links.link(contactId)) close();
  }

  async function createAndLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    if (await links.create({ name: name.trim(), kind })) close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
        className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-lg"
      >
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl">
            {creating ? "Create a contact" : "Add a contact"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "Just a name and what they are to you. Add the rest on their page."
              : "Search your contacts first, so the same person is never saved twice."}
          </DialogDescription>
        </DialogHeader>

        {/* Everything behind a modal is hidden from assistive tech, so a failure while the dialog
            is open is reported here rather than on the card beneath it. */}
        {links.error && (
          <p role="alert" className="mb-4 rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {links.error}
          </p>
        )}

        {creating ? (
          <form onSubmit={createAndLink} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-name`}>Name</Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={CONTACT_LIMITS.name}
                required
                autoFocus
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-kind`}>Kind</Label>
              <ContactKindSelect id={`${fieldId}-kind`} value={kind} onChange={setKind} />
            </div>
            <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={() => setCreating(false)}
              >
                Back to search
              </Button>
              <Button type="submit" className="h-10 px-4" disabled={links.pending}>
                <UserPlus aria-hidden="true" />
                {links.pending ? "Adding…" : "Create and add"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-search`}>Search your contacts</Label>
              <Input
                id={`${fieldId}-search`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, agency, or title"
                autoComplete="off"
                aria-describedby={`${fieldId}-status`}
                className="h-10"
              />
            </div>
            <p id={`${fieldId}-status`} role="status" className="text-sm text-muted-foreground">
              {status}
            </p>

            {shown.length > 0 && (
              // Capped and scrolled, so a user with many contacts opens the same short dialog as a
              // user with two: the search box and "Create" stay in view without scrolling.
              <ul
                aria-label="Matching contacts"
                className="max-h-44 space-y-1.5 overflow-y-auto pr-1"
              >
                {shown.map((contact) => (
                  <li key={contact.id}>
                    <Button
                      variant="outline"
                      className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
                      disabled={links.pending}
                      onClick={() => linkExisting(contact.id)}
                    >
                      <span className="min-w-0">
                        <span className="block font-bold">{contact.name}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {kindLine(contact)}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {term && !exactName && (
              <Button
                variant="ghost"
                className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
                onClick={() => {
                  setName(query.trim());
                  setCreating(true);
                }}
              >
                <Plus aria-hidden="true" />
                Create “{query.trim()}”
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
