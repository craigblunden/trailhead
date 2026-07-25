"use client";

import { useId } from "react";
import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { JobPatch } from "@/components/jobs-provider";
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
              value={job.salaryMin ?? ""}
              onChange={(event) =>
                onChange({
                  salaryMin: event.target.value === "" ? null : Number(event.target.value),
                })
              }
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
              value={job.salaryMax ?? ""}
              onChange={(event) =>
                onChange({
                  salaryMax: event.target.value === "" ? null : Number(event.target.value),
                })
              }
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

        <div>
          <FieldLabel>Resume used</FieldLabel>
          {job.resumeFile ? (
            <p className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5">
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{job.resumeFile}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              No resume attached yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
