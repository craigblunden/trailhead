"use client";

import { useId, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { useDraft } from "@/components/job/use-draft";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { JobPatch } from "@/components/jobs-provider";
import { calendarDate, isoDateLocal, todayUtc } from "@/lib/dates";
import { salaryFromText } from "@/lib/job-fields";
import { formatLongDate, type Job } from "@/lib/jobs";

type DetailsCardProps = {
  job: Job;
  onChange: (patch: JobPatch) => void;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
      {children}
    </span>
  );
}

/**
 * The applied date, corrected in place: a stage change backfills it with the day it happened, and
 * this is how that guess gets fixed. Picking a day saves and closes at once — there is nothing to
 * confirm — and the future stays closed off, same as the stage backfill never invents one ahead of
 * today.
 */
function AppliedDateField({
  appliedOn,
  onChange,
}: {
  appliedOn: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = calendarDate(appliedOn);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mt-1 h-9 gap-2 px-3 font-normal"
        >
          <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
          {formatLongDate(appliedOn)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          // Today is the server's UTC calendar day, the same "today" the backfill and the
          // server-side check both use (`lib/dates.ts`, `pastCalendarDate` in validation.ts) — not
          // the viewer's own, so a viewer ahead of UTC can see their real today greyed out for
          // part of the day. Disabling by the viewer's own clock instead would let one be picked
          // that the server then refuses, which is worse: a rejection after the fact rather than a
          // day that is briefly ungreyed a few hours late.
          disabled={{ after: calendarDate(todayUtc()) }}
          onSelect={(date) => {
            if (!date) return;
            onChange(isoDateLocal(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DetailsCard({ job, onChange }: DetailsCardProps) {
  const fieldId = useId();
  // Read the way validation reads it, so what is sent is what the server would make of the text.
  const [min, setMin, flushMin] = useDraft(
    job.salaryMin?.toString() ?? "",
    (value) => onChange({ salaryMin: salaryFromText(value) }),
  );
  const [max, setMax, flushMax] = useDraft(
    job.salaryMax?.toString() ?? "",
    (value) => onChange({ salaryMax: salaryFromText(value) }),
  );

  return (
    <Card
      role="region"
      aria-labelledby="details-heading"
      className="[--card-spacing:--spacing(5)]"
    >
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id="details-heading">Details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset>
          <legend className="mb-2">
            <FieldLabel>Salary expectation</FieldLabel>
          </legend>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${fieldId}-min`} className="sr-only">
              Minimum salary expectation, in thousands
            </Label>
            <Input
              id={`${fieldId}-min`}
              type="number"
              inputMode="numeric"
              min={0}
              className="h-10"
              value={min}
              onChange={(event) => setMin(event.target.value)}
              onBlur={flushMin}
            />
            <span aria-hidden="true" className="text-muted-foreground">
              –
            </span>
            <Label htmlFor={`${fieldId}-max`} className="sr-only">
              Maximum salary expectation, in thousands
            </Label>
            <Input
              id={`${fieldId}-max`}
              type="number"
              inputMode="numeric"
              min={0}
              className="h-10"
              value={max}
              onChange={(event) => setMax(event.target.value)}
              onBlur={flushMax}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            In thousands, per year
          </p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <FieldLabel>{job.appliedOn ? "Applied" : "Added"}</FieldLabel>
          {job.appliedOn ? (
            <AppliedDateField
              appliedOn={job.appliedOn}
              onChange={(appliedOn) => onChange({ appliedOn })}
            />
          ) : (
            <p className="mt-1">{formatLongDate(job.addedOn)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
