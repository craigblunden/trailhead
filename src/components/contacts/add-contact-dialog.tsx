"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ContactKindSelect } from "@/components/contacts/contact-kind-select";
import { failureMessage, useContactMutations } from "@/components/contacts/contacts-provider";
import { ActionError } from "@/components/jobs-actions-client";
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
import { DEFAULT_CONTACT_KIND, type ContactKind } from "@/lib/contacts";

type AddContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

/** Name and kind, then the Contact's own page for everything else — the same as from a Job. */
export function AddContactDialog({ open, onOpenChange, returnFocusTo }: AddContactDialogProps) {
  const fieldId = useId();
  const router = useRouter();
  const { create } = useContactMutations();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ContactKind>(DEFAULT_CONTACT_KIND);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setKind(DEFAULT_CONTACT_KIND);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const contact = await create.mutateAsync({ name: name.trim(), kind });
      reset();
      onOpenChange(false);
      router.push(`/contacts/${contact.id}`);
    } catch (failure) {
      setError(
        failure instanceof ActionError && failure.fields.name
          ? failure.fields.name
          : failureMessage(failure, "That contact wasn't saved. Check your connection and try again."),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
        className="gap-0 p-6 sm:max-w-md"
      >
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl">Add a contact</DialogTitle>
          <DialogDescription>
            Just a name and what they are to you. Add the rest on their page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-name`}>Name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              className="h-10"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fieldId}-error` : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-kind`}>Kind</Label>
            <ContactKindSelect id={`${fieldId}-kind`} value={kind} onChange={setKind} />
          </div>
          {error && (
            <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
