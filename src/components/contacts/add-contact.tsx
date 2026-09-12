"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ContactKindSelect } from "@/components/contacts/contact-kind-select";
import { useContactMutations } from "@/components/contacts/contacts-provider";
import { ActionError, describeFailure } from "@/components/action-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTACT_LIMITS, DEFAULT_CONTACT_KIND, type ContactKind } from "@/lib/contacts";
import { cn } from "@/lib/utils";

/**
 * The contacts page's add card, always open beside the list as the documents page's upload card is.
 * Name and kind, then the Contact's own page for everything else — the same as from a Job.
 */
export function AddContact({ className }: { className?: string }) {
  const fieldId = useId();
  const router = useRouter();
  const { create } = useContactMutations();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ContactKind>(DEFAULT_CONTACT_KIND);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const contact = await create.mutateAsync({ name: name.trim(), kind });
      setName("");
      setKind(DEFAULT_CONTACT_KIND);
      router.push(`/contacts/${contact.id}`);
    } catch (failure) {
      setError(
        failure instanceof ActionError && failure.fields.name
          ? failure.fields.name
          : describeFailure(failure, "That contact wasn't saved. Check your connection and try again."),
      );
    }
  }

  return (
    <section
      aria-labelledby={`${fieldId}-heading`}
      className={cn("rounded-lg bg-card p-5 ring-1 ring-foreground/10", className)}
    >
      <h2 id={`${fieldId}-heading`} className="text-lg">
        Add a contact
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Just a name and what they are to you. Add the rest on their page.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-name`}>Name</Label>
          <Input
            id={`${fieldId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={CONTACT_LIMITS.name}
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
        <Button type="submit" className="h-10 w-full px-4" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save contact"}
        </Button>
      </form>
    </section>
  );
}
