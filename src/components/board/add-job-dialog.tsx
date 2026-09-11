"use client";

import { useId } from "react";

import { useJobs } from "@/components/jobs-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AddJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The control that opened the dialog. Focus returns here on close (WCAG
   * 2.4.3) — Radix cannot infer it, because the trigger lives in the header
   * rather than wrapping this dialog.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

/** Blank string or a non-numeric entry both mean "not specified". */
function parseSalary(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export function AddJobDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: AddJobDialogProps) {
  const { addJob } = useJobs();
  const fieldId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    addJob({
      company: String(data.get("company") ?? "").trim(),
      role: String(data.get("role") ?? "").trim(),
      location: String(data.get("location") ?? "").trim() || "Location TBD",
      salaryMin: parseSalary(data.get("salaryMin")),
      salaryMax: parseSalary(data.get("salaryMax")),
      postingUrl: String(data.get("postingUrl") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
    });

    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.current) return;
          event.preventDefault();
          returnFocusTo.current.focus();
        }}
        className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-xl"
      >
        <DialogHeader className="mb-5">
          <DialogTitle className="text-xl">Add a job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-company`}>Company</Label>
              <Input
                id={`${fieldId}-company`}
                name="company"
                placeholder="Acme Co"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-role`}>Role title</Label>
              <Input
                id={`${fieldId}-role`}
                name="role"
                placeholder="Product Designer"
                required
                className="h-10"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-location`}>Location</Label>
              <Input
                id={`${fieldId}-location`}
                name="location"
                placeholder="Remote / NYC"
                className="h-10"
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm leading-none font-medium">
                Salary range (k, optional)
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

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-posting`}>Application link</Label>
            <Input
              id={`${fieldId}-posting`}
              name="postingUrl"
              type="url"
              placeholder="https://…"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-description`}>Job description</Label>
            <Textarea
              id={`${fieldId}-description`}
              name="description"
              rows={4}
              placeholder="Paste the posting text — you can edit it later"
            />
          </div>

          <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4">
              Add to board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
