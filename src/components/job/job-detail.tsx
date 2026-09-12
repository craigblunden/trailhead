"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { CompanyAvatar } from "@/components/company-avatar";
import { useJobs, type JobPatch } from "@/components/jobs-provider";
import { ActivityCard } from "@/components/job/activity-card";
import { ApplicationKitCard } from "@/components/job/application-kit";
import { ContactsCard } from "@/components/job/job-contacts";
import { CoverLetterCard } from "@/components/job/cover-letter";
import { JobDetailHeader } from "@/components/job/job-detail-header";
import { DetailsCard } from "@/components/job/details-card";
import { JobLoading } from "@/components/page-loading";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, STAGE_META, webLink, type Job, type Stage } from "@/lib/jobs";

export function JobDetail({ jobId }: { jobId: string }) {
  const { getJob, updateJob, setStage, status, error, dismissError } = useJobs();
  const job = getJob(jobId);

  // The same outline the navigation showed; here it stays until the client's own fetch answers.
  if (!job && status === "pending") return <JobLoading id={jobId} />;
  // An unknown id and another user's id are the same thing here, on purpose.
  if (!job) return <DetailMissing />;
  return (
    <JobDetailView
      job={job}
      error={error}
      dismissError={dismissError}
      onPatch={(patch) => updateJob(job.id, patch)}
      onStage={(stage) => setStage(job.id, stage)}
    />
  );
}

function DetailMissing() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <JobDetailHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl">This job isn&rsquo;t on your trail</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link is out of date.
        </p>
        <Button asChild className="mt-6 h-10 px-4">
          <Link href="/board">Back to your trail</Link>
        </Button>
      </main>
    </div>
  );
}

type JobDetailViewProps = {
  job: Job;
  error: string | null;
  dismissError: () => void;
  onPatch: (patch: JobPatch) => Promise<boolean>;
  onStage: (stage: Stage) => void;
};

/**
 * Text the user edits in one sitting and saves with a button. The draft is `null` while untouched,
 * so the field follows what the server holds until the user types, and again once a save is
 * accepted. A refused save leaves the text in the field, with the button live again, so there is
 * something to fix rather than retype.
 */
function useSavedText(saved: string, save: (value: string) => Promise<boolean>) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  return {
    value,
    // False while a save is in flight too: the optimistic value already matches the draft.
    changed: value !== saved,
    set: setDraft,
    save: async () => {
      const sent = value;
      if (await save(sent)) setDraft((current) => (current === sent ? null : current));
    },
  };
}

function SaveRow({
  changed,
  onSave,
  children,
}: {
  changed: boolean;
  onSave: () => Promise<void>;
  children: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-3">
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {changed ? "Unsaved changes" : null}
      </span>
      <Button type="button" className="h-9 px-3.5" disabled={!changed} onClick={() => void onSave()}>
        {children}
      </Button>
    </div>
  );
}

/** Each free-text field is saved by its own button, so a long paste is never saved mid-edit. */
function JobDetailView({ job, error, dismissError, onPatch, onStage }: JobDetailViewProps) {
  const description = useSavedText(job.description, (value) => onPatch({ description: value }));
  const notes = useSavedText(job.notes, (value) => onPatch({ notes: value }));
  const posting = webLink(job.postingUrl);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <JobDetailHeader />

      <PageMain>
        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm"
          >
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={dismissError}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyAvatar company={job.company} accent={job.accent} size="lg" />
            <div className="min-w-0">
              <h1 className="text-3xl leading-tight tracking-tight text-balance">
                {job.role}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {job.company} · {job.location}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center gap-3 sm:w-auto">
            <Select value={job.stage} onValueChange={(next) => onStage(next as Stage)}>
              <SelectTrigger
                className="h-9 w-full min-w-32 sm:w-40"
                aria-label="Application stage"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_META[stage].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* `disabled` does nothing to an anchor, so a job with no usable
                URL gets a real disabled button instead of a dead link. */}
            {posting ? (
              <Button asChild className="h-9 px-3.5">
                <a href={posting} target="_blank" rel="noopener noreferrer">
                  Open posting
                  <ArrowUpRight aria-hidden="true" />
                  <span className="sr-only">, opens in a new tab</span>
                </a>
              </Button>
            ) : (
              <Button disabled className="h-9 px-3.5">
                No posting link
                <ArrowUpRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        {/* The side cards in one column beside the writing, and in two from `2xl`, where one column
            of text boxes would otherwise run the full width of the page. */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_43.5rem]">
          <div className="min-w-0 space-y-6">
            <section
              aria-labelledby="description-heading"
              className="rounded-lg bg-card p-5 ring-1 ring-foreground/10"
            >
              <h2 id="description-heading" className="text-lg">
                Job description
              </h2>
              <p id="description-hint" className="mt-1 text-sm text-muted-foreground">
                Keep this current — it feeds your cover letter later.
              </p>
              <Textarea
                aria-labelledby="description-heading"
                aria-describedby="description-hint"
                value={description.value}
                onChange={(event) => description.set(event.target.value)}
                className="mt-3 min-h-56 resize-y"
              />
              <SaveRow changed={description.changed} onSave={description.save}>
                Save description
              </SaveRow>
            </section>

            <section
              aria-labelledby="notes-heading"
              className="rounded-lg bg-card p-5 ring-1 ring-foreground/10"
            >
              <h2 id="notes-heading" className="text-lg">
                Notes
              </h2>
              <Textarea
                aria-labelledby="notes-heading"
                placeholder="Interview prep, follow-ups, anything worth remembering."
                value={notes.value}
                onChange={(event) => notes.set(event.target.value)}
                className="mt-3 min-h-32 resize-y"
              />
              <SaveRow changed={notes.changed} onSave={notes.save}>
                Save notes
              </SaveRow>
            </section>

            <CoverLetterCard job={job} />
          </div>

          <aside className="grid min-w-0 grid-cols-1 items-start gap-6 2xl:grid-cols-2">
            <div className="min-w-0 space-y-6">
              <DetailsCard job={job} onChange={onPatch} />
              <ApplicationKitCard job={job} />
            </div>
            <div className="min-w-0 space-y-6">
              <ContactsCard job={job} />
              <ActivityCard entries={job.activity} />
            </div>
          </aside>
        </div>
      </PageMain>
    </div>
  );
}
