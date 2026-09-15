"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

import { ContactKindSelect } from "@/components/contacts/contact-kind-select";
import { useContactList } from "@/components/contacts/contacts-provider";
import { useJobs } from "@/components/jobs-provider";
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
import {
  CONTACT_LIMITS,
  DEFAULT_CONTACT_KIND,
  kindLine,
  type ContactKind,
  type ContactListItem,
} from "@/lib/contacts";
import { locationOrFallback, salaryFromText } from "@/lib/job-fields";
import { pluralize } from "@/lib/jobs";
import type { NewJobInput } from "@/lib/jobs-client";
import { cn } from "@/lib/utils";

type AddJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The control that opened the dialog. Focus returns here on close (WCAG
   * 2.4.3) — Radix cannot infer it, because the trigger lives beside the board’s
   * title rather than wrapping this dialog.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

export function AddJobDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: AddJobDialogProps) {
  const { addJob } = useJobs();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
        className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-xl"
      >
        <DialogHeader className="mb-6">
          <DialogTitle className="text-xl">Add a job</DialogTitle>
          <DialogDescription>
            Fields marked <span className="text-destructive">*</span> are
            required.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so every opening starts from an empty form. */}
        <AddJobForm
          onCancel={() => onOpenChange(false)}
          onSubmit={(input) => {
            addJob(input);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The contact fields behind the toggle. None is any use on its own: filling one asks for a name. */
const BLANK_DETAILS = {
  title: "",
  agency: "",
  email: "",
  phone: "",
  linkedinUrl: "",
};

type ContactDetails = typeof BLANK_DETAILS;

/** More than this and the user should type a little more; the section stays short. */
const MAX_CONTACT_MATCHES = 4;

function AddJobForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: NewJobInput) => void;
}) {
  const fieldId = useId();
  const detailsId = `${fieldId}-contact-details`;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ContactKind>(DEFAULT_CONTACT_KIND);
  const [chosen, setChosen] = useState<ContactListItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Held here rather than read off the form, so closing the section hides the fields without
  // throwing away what was typed into them.
  const [details, setDetails] = useState<ContactDetails>(BLANK_DETAILS);
  // The form is mounted only while the dialog is open, so this asks once per opening.
  const contacts = useContactList();

  const filled = Object.values(details).filter((value) => value.trim()).length;
  const term = name.trim().toLowerCase();
  const matches = term
    ? (contacts.data ?? []).filter((contact) =>
        [contact.name, contact.agency, contact.title].some((value) =>
          value.toLowerCase().includes(term),
        ),
      )
    : [];
  const shown = matches.slice(0, MAX_CONTACT_MATCHES);

  /** Choosing one of the user's own replaces everything the new-person fields were for. */
  function choose(contact: ContactListItem) {
    setChosen(contact);
    setName("");
    setDetailsOpen(false);
    setDetails(BLANK_DETAILS);
  }

  const setDetail = (field: keyof ContactDetails) => (value: string) =>
    setDetails((current) => ({ ...current, [field]: value }));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (field: string) => String(data.get(field) ?? "").trim();
    const contactName = name.trim();

    // Salary and a blank location are read exactly as validation reads them.
    onSubmit({
      company: text("company"),
      role: text("role"),
      location: locationOrFallback(String(data.get("location") ?? "")),
      salaryMin: salaryFromText(data.get("salaryMin")),
      salaryMax: salaryFromText(data.get("salaryMax")),
      postingUrl: text("postingUrl"),
      description: text("description"),
      // One of the user's own is linked by id, never copied — that is what stops the same person
      // being saved twice. No name and nobody chosen means nobody was entered, so the rest of the
      // section is dropped rather than stored as a nameless person.
      contact: chosen
        ? { contactId: chosen.id }
        : contactName
          ? {
              name: contactName,
              kind,
              title: details.title.trim(),
              agency: details.agency.trim(),
              email: details.email.trim(),
              phone: details.phone.trim(),
              linkedinUrl: details.linkedinUrl.trim(),
            }
          : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${fieldId}-company`} label="Company" required>
            <Input
              id={`${fieldId}-company`}
              name="company"
              placeholder="Acme Co"
              required
              className="h-10"
            />
          </Field>
          <Field id={`${fieldId}-role`} label="Role title" required>
            <Input
              id={`${fieldId}-role`}
              name="role"
              placeholder="Product Designer"
              required
              className="h-10"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${fieldId}-location`} label="Location">
            <Input
              id={`${fieldId}-location`}
              name="location"
              placeholder="Hybrid / Brisbane"
              className="h-10"
            />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-sm leading-none font-medium">
              Salary range (k)
            </legend>
            <div className="flex items-center gap-2">
              <Label htmlFor={`${fieldId}-salary-min`} className="sr-only">
                Minimum salary, in thousands
              </Label>
              <Input
                id={`${fieldId}-salary-min`}
                name="salaryMin"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="120"
                className="h-10"
              />
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              <Label htmlFor={`${fieldId}-salary-max`} className="sr-only">
                Maximum salary, in thousands
              </Label>
              <Input
                id={`${fieldId}-salary-max`}
                name="salaryMax"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="150"
                className="h-10"
              />
            </div>
          </fieldset>
        </div>

        <Field id={`${fieldId}-posting`} label="Application link">
          <Input
            id={`${fieldId}-posting`}
            name="postingUrl"
            type="url"
            placeholder="https://…"
            className="h-10"
          />
        </Field>

        <Field id={`${fieldId}-description`} label="Job description">
          <Textarea
            id={`${fieldId}-description`}
            name="description"
            rows={4}
            placeholder="Paste the posting text — you can edit it later"
          />
        </Field>
      </div>

      {/* The rule sits on the wrapper, not the fieldset: a bordered fieldset has its legend cut a
          notch out of the line, which here would leave a stub hanging off the left edge. */}
      <div className="border-t pt-6">
        <fieldset>
          <legend className="font-heading text-base font-medium">
            Contact
          </legend>
          <div className="mt-2 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {chosen
                ? "On the job from the moment it is added. The rest of their details live on their own page."
                : "Optional. Search the people you have saved, or add someone new."}
            </p>

            {chosen ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-bold">{chosen.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {kindLine(chosen)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-3"
                  onClick={() => setChosen(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                {/* Naming the person and searching for them are the same act, so the matches and
                  what they mean sit with the name field rather than a field's width away. */}
                <div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id={`${fieldId}-contact-name`}
                      label="Name"
                      // The name is what makes the rest worth keeping, so it is asked for as soon
                      // as any of the rest is filled in.
                      required={filled > 0}
                    >
                      <Input
                        id={`${fieldId}-contact-name`}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={CONTACT_LIMITS.name}
                        autoComplete="off"
                        aria-describedby={
                          term ? `${fieldId}-contact-status` : undefined
                        }
                        required={filled > 0}
                        className="h-10"
                      />
                    </Field>
                    <Field id={`${fieldId}-contact-kind`} label="Kind">
                      <ContactKindSelect
                        id={`${fieldId}-contact-kind`}
                        value={kind}
                        onChange={setKind}
                      />
                    </Field>
                  </div>

                  {term && (
                    <p
                      id={`${fieldId}-contact-status`}
                      role="status"
                      className="mt-2 text-xs text-muted-foreground"
                    >
                      {contactSearchStatus(contacts.isError, shown.length)}
                    </p>
                  )}

                  {shown.length > 0 && (
                    <ul
                      aria-label="Matching contacts"
                      className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1"
                    >
                      {shown.map((contact) => (
                        <li key={contact.id}>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
                            onClick={() => choose(contact)}
                          >
                            <span className="min-w-0">
                              <span className="block font-bold">
                                {contact.name}
                              </span>
                              <span className="block text-xs font-normal text-muted-foreground">
                                {kindLine(contact)}
                              </span>
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-expanded={detailsOpen}
                    aria-controls={detailsId}
                    className="h-8 w-fit px-2"
                    onClick={() => setDetailsOpen((open) => !open)}
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        "transition-transform",
                        detailsOpen && "rotate-90",
                      )}
                    />
                    Add their details
                  </Button>
                  {/* Closing the section only hides the fields, so say what is still going to be saved. */}
                  {!detailsOpen && filled > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {pluralize(filled, "detail")} filled in
                    </span>
                  )}
                </div>

                {/* Closed rather than unmounted: the values survive, and `hidden` is what takes the
                  fields out of the tab order and the accessibility tree while they are put away.
                  The section around this is a flex column, so while it is closed it takes up no
                  room and draws no gap of its own. */}
                <div
                  id={detailsId}
                  hidden={!detailsOpen}
                  className={cn(
                    "grid gap-4 sm:grid-cols-2",
                    !detailsOpen && "hidden",
                  )}
                >
                  <DetailField
                    id={`${fieldId}-contact-title`}
                    label="Title"
                    maxLength={CONTACT_LIMITS.title}
                    value={details.title}
                    onChange={setDetail("title")}
                  />
                  <DetailField
                    id={`${fieldId}-contact-agency`}
                    label="Agency"
                    hint="Only if it is not the hiring company."
                    maxLength={CONTACT_LIMITS.agency}
                    value={details.agency}
                    onChange={setDetail("agency")}
                  />
                  <DetailField
                    id={`${fieldId}-contact-email`}
                    label="Email"
                    type="email"
                    maxLength={CONTACT_LIMITS.email}
                    value={details.email}
                    onChange={setDetail("email")}
                  />
                  <DetailField
                    id={`${fieldId}-contact-phone`}
                    label="Phone"
                    type="tel"
                    maxLength={CONTACT_LIMITS.phone}
                    value={details.phone}
                    onChange={setDetail("phone")}
                  />
                  <DetailField
                    id={`${fieldId}-contact-linkedin`}
                    label="LinkedIn"
                    type="url"
                    placeholder="https://…"
                    maxLength={CONTACT_LIMITS.linkedinUrl}
                    value={details.linkedinUrl}
                    onChange={setDetail("linkedinUrl")}
                    className="sm:col-span-2"
                  />
                </div>
              </>
            )}
          </div>
        </fieldset>
      </div>

      <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" className="h-10 px-4">
          Add to board
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * What the name field's matches mean. A contact list that failed to load finds nothing, which is
 * not the same as there being nobody — saying so is what stops it reading as "you have no such
 * person" when the truth is that we could not look.
 */
function contactSearchStatus(failed: boolean, matches: number): string {
  if (failed)
    return "We couldn’t search your contacts, so this adds someone new.";
  if (matches === 0)
    return "Nobody saved matches that, so this adds someone new.";
  return `${pluralize(matches, "saved contact")} — choose one instead of adding them again.`;
}

/** The on-screen keyboard each detail field asks a phone for. */
const DETAIL_INPUT_MODE = { email: "email", tel: "tel", url: "url" } as const;

/** One of the optional fields behind "Add their details". */
function DetailField({
  id,
  label,
  hint,
  className,
  onChange,
  ...input
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  type?: keyof typeof DETAIL_INPUT_MODE;
  placeholder?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint} className={className}>
      <Input
        {...input}
        id={id}
        inputMode={input.type && DETAIL_INPUT_MODE[input.type]}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-10"
      />
    </Field>
  );
}

/**
 * One labelled control. Every field in the dialog is built from this, so the three distances that
 * make a form readable — label to control, control to the note about it, field to field — are set
 * once here rather than repeated beside each field and drifting apart.
 *
 * The asterisk sits beside the label rather than inside it, so the field's name stays the field's
 * name: `required` is what tells assistive tech, and the dialog's description says what it means.
 */
function Field({
  id,
  label,
  required,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {/* `leading-none` matches the label's own line box, so the asterisk cannot make a required
          field's label sit further from its control than an optional one's. */}
      <div className="mb-1.5 flex items-center gap-1 leading-none">
        <Label htmlFor={id}>{label}</Label>
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
