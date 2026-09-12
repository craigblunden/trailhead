"use client";

import { useId, useState } from "react";
import { Pencil } from "lucide-react";

import type { JobPatch } from "@/components/jobs-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOB_LIMITS, LOCATION_FALLBACK, locationOrFallback } from "@/lib/job-fields";
import { webLink, type Job } from "@/lib/jobs";

type EditableField = "company" | "role" | "location" | "postingUrl";

type EditJobDialogProps = {
  job: Job;
  onPatch: (patch: JobPatch) => unknown;
};

/**
 * Edits what the user typed about a Job when adding it — company, role, location, application link.
 * Salary and the free-text panels already edit in place on the page. Like adding a Job, saving
 * closes the dialog at once: the change shows straight away, and a refusal rolls back and says why
 * on the page.
 */
export function EditJobDialog({ job, onPatch }: EditJobDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-3.5">
          <Pencil aria-hidden="true" />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-xl"
      >
        <DialogHeader className="mb-5">
          <DialogTitle className="text-xl">Edit job details</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from what the Job holds now. */}
        <EditJobForm
          job={job}
          onCancel={() => setOpen(false)}
          onSave={(patch) => {
            if (Object.keys(patch).length > 0) onPatch(patch);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditJobForm({
  job,
  onCancel,
  onSave,
}: {
  job: Job;
  onCancel: () => void;
  onSave: (patch: JobPatch) => void;
}) {
  const fieldId = useId();
  const [fields, setFields] = useState<Record<EditableField, string>>({
    company: job.company,
    role: job.role,
    // The default reads as blank here, so clearing the field is how it is put back.
    location: job.location === LOCATION_FALLBACK ? "" : job.location,
    postingUrl: job.postingUrl,
  });
  const [linkError, setLinkError] = useState<string | null>(null);

  const set = (name: EditableField, value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
    if (name === "postingUrl") setLinkError(null);
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Read exactly as validation reads them. `type="url"` lets `javascript:` through, so the link is
    // checked here too rather than being refused after the dialog has closed.
    const next: Record<EditableField, string> = {
      company: fields.company.trim(),
      role: fields.role.trim(),
      location: locationOrFallback(fields.location),
      postingUrl: fields.postingUrl.trim(),
    };
    if (next.postingUrl !== "" && !webLink(next.postingUrl)) {
      setLinkError("Enter a web address starting with http:// or https://");
      return;
    }

    const patch: JobPatch = {};
    for (const name of Object.keys(next) as EditableField[]) {
      if (next[name] !== job[name]) patch[name] = next[name];
    }
    onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-company`}>Company</Label>
          <Input
            id={`${fieldId}-company`}
            value={fields.company}
            onChange={(event) => set("company", event.target.value)}
            maxLength={JOB_LIMITS.company}
            required
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-role`}>Role title</Label>
          <Input
            id={`${fieldId}-role`}
            value={fields.role}
            onChange={(event) => set("role", event.target.value)}
            maxLength={JOB_LIMITS.role}
            required
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-location`}>Location</Label>
        <Input
          id={`${fieldId}-location`}
          value={fields.location}
          onChange={(event) => set("location", event.target.value)}
          maxLength={JOB_LIMITS.location}
          placeholder="Hybrid / Brisbane"
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-posting`}>Application link</Label>
        <Input
          id={`${fieldId}-posting`}
          type="url"
          inputMode="url"
          value={fields.postingUrl}
          onChange={(event) => set("postingUrl", event.target.value)}
          maxLength={JOB_LIMITS.postingUrl}
          placeholder="https://…"
          aria-invalid={linkError ? true : undefined}
          aria-describedby={linkError ? `${fieldId}-posting-error` : undefined}
          className="h-10"
        />
        {linkError && (
          <p id={`${fieldId}-posting-error`} className="text-sm text-destructive">
            {linkError}
          </p>
        )}
      </div>

      <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-10 px-4">
          Save details
        </Button>
      </DialogFooter>
    </form>
  );
}
