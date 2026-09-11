"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowLeft, CalendarCheck, Trash2 } from "lucide-react";

import { ContactKindSelect } from "@/components/contacts/contact-kind-select";
import {
  failureMessage,
  useContactDetail,
  useContactMutations,
} from "@/components/contacts/contacts-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { kindLine, todayUtc, type ContactDetail } from "@/lib/contacts";
import type { ContactFields } from "@/lib/contacts-client";
import { STAGES, STAGE_META, formatLongDate, pluralize, webLink, type Stage } from "@/lib/jobs";

export function ContactDetailView({ contactId }: { contactId: string }) {
  const contact = useContactDetail(contactId);

  if (contact.data) return <ContactProfile key={contact.data.id} contact={contact.data} />;
  if (contact.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading this contact…
      </p>
    );
  }
  if (contact.error instanceof ActionError && contact.error.kind === "not-found") {
    return <ContactMissing />;
  }
  return (
    <div role="alert" className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <h1 className="text-lg">We couldn’t load this contact</h1>
      <Button className="mt-4 h-10 px-4" onClick={() => contact.refetch()}>
        Try again
      </Button>
    </div>
  );
}

/** An unknown id and another user's id are the same thing here, on purpose. */
export function ContactMissing() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <h1 className="text-2xl">This contact isn’t in your contacts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        They may have been deleted, or the link is out of date.
      </p>
      <Button asChild className="mt-6 h-10 px-4">
        <Link href="/contacts">Back to contacts</Link>
      </Button>
    </div>
  );
}

function fieldsOf(contact: ContactDetail): ContactFields {
  return {
    name: contact.name,
    kind: contact.kind,
    title: contact.title,
    agency: contact.agency,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
    linkedinUrl: contact.linkedinUrl,
    lastSpokenOn: contact.lastSpokenOn,
  };
}

type TextFieldName = Exclude<keyof ContactFields, "kind" | "lastSpokenOn" | "notes">;

function ContactProfile({ contact }: { contact: ContactDetail }) {
  const fieldId = useId();
  const router = useRouter();
  const { update, remove } = useContactMutations();
  const [fields, setFields] = useState<ContactFields>(() => fieldsOf(contact));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const set = <K extends keyof ContactFields>(key: K, value: ContactFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setNotice("");
  };

  async function save(patch: Partial<ContactFields>, savedMessage: string) {
    setFailure(null);
    setNotice("");
    try {
      const saved = await update.mutateAsync({ id: contact.id, patch });
      setFields(fieldsOf(saved));
      setErrors({});
      setNotice(savedMessage);
    } catch (error) {
      if (error instanceof ActionError && error.kind === "invalid") {
        setErrors(error.fields);
      } else {
        setFailure(failureMessage(error, "Those changes weren't saved. Check your connection and try again."));
      }
    }
  }

  async function deleteContact() {
    setFailure(null);
    try {
      await remove.mutateAsync(contact.id);
      setConfirmOpen(false);
      router.push("/contacts");
    } catch (error) {
      setConfirmOpen(false);
      setFailure(failureMessage(error, "That contact wasn't deleted. Check your connection and try again."));
    }
  }

  const describedBy = (name: string, hint?: boolean) =>
    [hint ? `${fieldId}-${name}-hint` : null, errors[name] ? `${fieldId}-${name}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const errorText = (name: string) =>
    errors[name] ? (
      <p id={`${fieldId}-${name}-error`} className="text-sm text-destructive">
        {errors[name]}
      </p>
    ) : null;

  const textField = (
    name: TextFieldName,
    label: string,
    options: { type?: string; hint?: string; maxLength: number; required?: boolean; inputMode?: "email" | "tel" | "url" },
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${fieldId}-${name}`}>{label}</Label>
      <Input
        id={`${fieldId}-${name}`}
        type={options.type ?? "text"}
        inputMode={options.inputMode}
        value={fields[name]}
        onChange={(event) => set(name, event.target.value)}
        maxLength={options.maxLength}
        required={options.required}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name, Boolean(options.hint))}
        className="h-10"
      />
      {options.hint && (
        <p id={`${fieldId}-${name}-hint`} className="text-xs text-muted-foreground">
          {options.hint}
        </p>
      )}
      {errorText(name)}
    </div>
  );

  const linkedin = webLink(contact.linkedinUrl);
  const today = todayUtc();

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 lg:hidden">
          <Link href="/contacts">
            <ArrowLeft aria-hidden="true" />
            All contacts
          </Link>
        </Button>
        <h1 className="text-3xl leading-tight tracking-tight text-balance">{contact.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {kindLine(contact)}
          {contact.title && ` · ${contact.title}`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {contact.lastSpokenOn
            ? `Last spoke ${formatLongDate(contact.lastSpokenOn)}`
            : "No conversation recorded yet"}
          {linkedin && (
            <>
              {" · "}
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                LinkedIn<span className="sr-only">, opens in a new tab</span>
              </a>
            </>
          )}
        </p>
      </div>

      {failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm"
        >
          <span>{failure}</span>
          <Button variant="outline" size="sm" onClick={() => setFailure(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <RolesWith contact={contact} />

      <section
        aria-labelledby={`${fieldId}-details-heading`}
        className="rounded-lg bg-card p-5 ring-1 ring-foreground/10"
      >
        <h2 id={`${fieldId}-details-heading`} className="text-lg">
          Details
        </h2>
        <form
          className="mt-4 space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save(fields, "Saved.");
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {textField("name", "Name", { maxLength: 120, required: true })}
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-kind`}>Kind</Label>
              <ContactKindSelect
                id={`${fieldId}-kind`}
                value={fields.kind}
                onChange={(kind) => set("kind", kind)}
                describedBy={describedBy("kind")}
              />
              {errorText("kind")}
            </div>
            {textField("title", "Title", { maxLength: 120 })}
            {textField("agency", "Agency", {
              maxLength: 120,
              hint: "Only if they work for a firm other than the company hiring.",
            })}
            {textField("email", "Email", { type: "email", inputMode: "email", maxLength: 254 })}
            {textField("phone", "Phone", { type: "tel", inputMode: "tel", maxLength: 40 })}
          </div>

          {textField("linkedinUrl", "LinkedIn", { type: "url", inputMode: "url", maxLength: 2048 })}

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-lastSpokenOn`}>Last spoke</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${fieldId}-lastSpokenOn`}
                type="date"
                max={today}
                value={fields.lastSpokenOn ?? ""}
                onChange={(event) => set("lastSpokenOn", event.target.value || null)}
                aria-invalid={errors.lastSpokenOn ? true : undefined}
                aria-describedby={describedBy("lastSpokenOn")}
                className="h-10 w-auto"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 px-3.5"
                disabled={update.isPending}
                onClick={() => {
                  set("lastSpokenOn", today);
                  void save({ lastSpokenOn: today }, "Recorded that you spoke today.");
                }}
              >
                <CalendarCheck aria-hidden="true" />
                Spoke today
              </Button>
            </div>
            {errorText("lastSpokenOn")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-notes`}>Notes</Label>
            <Textarea
              id={`${fieldId}-notes`}
              value={fields.notes}
              onChange={(event) => set("notes", event.target.value)}
              maxLength={2000}
              aria-invalid={errors.notes ? true : undefined}
              aria-describedby={describedBy("notes")}
              className="min-h-24 resize-y"
            />
            {errorText("notes")}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-10 px-4" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          </div>
        </form>
      </section>

      <section aria-labelledby={`${fieldId}-delete-heading`} className="rounded-lg p-5 ring-1 ring-destructive/25">
        <h2 id={`${fieldId}-delete-heading`} className="text-lg">
          Delete this contact
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Removes {contact.name} from your contacts and from every job. The jobs stay.
        </p>
        <Button variant="destructive" className="mt-4 h-10 px-4" onClick={() => setConfirmOpen(true)}>
          <Trash2 aria-hidden="true" />
          Delete contact
        </Button>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="gap-0 p-6 sm:max-w-md">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">Delete {contact.name}?</DialogTitle>
            <DialogDescription>
              {contact.jobs.length === 0
                ? "They aren't on any job. This can't be undone."
                : `They'll be removed from ${pluralize(contact.jobs.length, "job")}. The jobs themselves stay on your board. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
            <Button variant="outline" className="h-10 px-4" onClick={() => setConfirmOpen(false)}>
              Keep contact
            </Button>
            <Button
              variant="destructive"
              className="h-10 px-4"
              disabled={remove.isPending}
              onClick={deleteContact}
            >
              {remove.isPending ? "Deleting…" : "Delete contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Which roles has Dana sent me?" — answered by grouping the linked Jobs by stage (ticket 13). */
function RolesWith({ contact }: { contact: ContactDetail }) {
  const headingId = useId();
  const byStage = new Map<Stage, ContactDetail["jobs"]>();
  for (const job of contact.jobs) {
    byStage.set(job.stage, [...(byStage.get(job.stage) ?? []), job]);
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg bg-card p-5 ring-1 ring-foreground/10">
      <h2 id={headingId} className="text-lg">
        Roles with {contact.name}
      </h2>
      {contact.jobs.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Not on any job yet. Add them from a job’s Contacts card.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {STAGES.filter((stage) => byStage.has(stage)).map((stage) => {
            const jobs = byStage.get(stage)!;
            return (
              <div key={stage}>
                <h3 className="flex items-center gap-2 font-sans text-sm font-bold">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: STAGE_META[stage].dot }}
                  />
                  {STAGE_META[stage].label}
                  <span className="font-normal text-muted-foreground">
                    {pluralize(jobs.length, "role")}
                  </span>
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {jobs.map((job) => (
                    <li key={job.id} className="text-sm">
                      <Link
                        href={`/board/${job.id}`}
                        className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {job.role}
                      </Link>
                      <span className="text-muted-foreground"> · {job.company}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
