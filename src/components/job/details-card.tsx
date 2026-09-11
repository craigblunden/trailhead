"use client";

import { useId } from "react";

import { useDraft } from "@/components/job/use-draft";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { JobPatch } from "@/components/jobs-provider";
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

export function DetailsCard({ job, onChange }: DetailsCardProps) {
  const fieldId = useId();
  // Read the way validation reads it, so what is sent is what the server would make of the text.
  const [min, setMin, flushMin] = useDraft(job.salaryMin?.toString() ?? "", (value) =>
    onChange({ salaryMin: salaryFromText(value) }),
  );
  const [max, setMax, flushMax] = useDraft(job.salaryMax?.toString() ?? "", (value) =>
    onChange({ salaryMax: salaryFromText(value) }),
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

        <div>
          <FieldLabel>{job.appliedOn ? "Applied" : "Added"}</FieldLabel>
          <p className="mt-1">
            {formatLongDate(job.appliedOn ?? job.addedOn)}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
