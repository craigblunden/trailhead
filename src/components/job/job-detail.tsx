"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MessagesSquare, Sparkles, Trash2 } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { CompanyAvatar } from "@/components/company-avatar";
import { useJobs, type JobPatch } from "@/components/jobs-provider";
import { ActivityCard } from "@/components/job/activity-card";
import { ApplicationKitCard } from "@/components/job/application-kit";
import { ContactsCard } from "@/components/job/job-contacts";
import { CoverLetterCard } from "@/components/job/cover-letter";
import { DetailsCard } from "@/components/job/details-card";
import { EditJobDialog } from "@/components/job/edit-job-dialog";
import {
  SummitHeaderFrame,
  SummitProgress,
} from "@/components/job/summit-header";
import { LoadErrorHint } from "@/components/load-error";
import { JobLoading } from "@/components/page-loading";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Excerpt } from "@/components/ui/excerpt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, STAGE_META, webLink, type Job, type Stage } from "@/lib/jobs";

/**
 * A Job's page. `scenes` is every Stage's picture for its header (`SummitScenes`), rendered by the
 * page on the server, so the drawing stays out of this component's JavaScript and is never redrawn
 * when the Job changes.
 */
export function JobDetail({
  jobId,
  scenes,
}: {
  jobId: string;
  scenes?: React.ReactNode;
}) {
  const {
    getJob,
    updateJob,
    setStage,
    removeJob,
    status,
    error,
    dismissError,
    reload,
    redirectFor,
  } = useJobs();
  const job = getJob(jobId);
  const router = useRouter();
  // Set only for a job opened at the optimistic id it was added under: the id a `useEffect` below
  // follows to where the add actually saved, the moment the server answers.
  const redirectTo = !job ? redirectFor(jobId) : undefined;
  // Read from the same `jobs` the branch below already agreed on — not a second, later lookup —
  // so the redirect's preview can never disagree with the decision to show it.
  const redirectJob = redirectTo ? getJob(redirectTo) : undefined;
  // Set the moment a delete is asked for, before the cache can drop the Job: a successful delete
  // removes it from the list as soon as the server agrees, which would otherwise read as "not on
  // your trail" for the render or two before the navigation below actually lands.
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (redirectTo) router.replace(`/board/${redirectTo}`);
  }, [redirectTo, router]);

  async function handleDelete() {
    setDeleting(true);
    const ok = await removeJob(jobId);
    if (ok) router.push("/board");
    else setDeleting(false);
    return ok;
  }

  // The same outline the navigation showed; here it stays until the client's own fetch answers, or
  // — for a job clicked open before its add settled — until the redirect above lands, or a delete
  // in flight is on its way to the board.
  if (!job && (status === "pending" || redirectTo || deleting))
    return <JobLoading id={jobId} job={redirectJob} />;
  // The list failed to load, not this one job: say so, with a way to retry, same as the board.
  if (!job && status === "error") return <JobDetailError onRetry={reload} />;
  // An unknown id and another user's id are the same thing here, on purpose.
  if (!job) return <DetailMissing />;
  return (
    <JobDetailView
      job={job}
      scenes={scenes}
      error={error}
      dismissError={dismissError}
      onPatch={(patch) => updateJob(job.id, patch)}
      onStage={(stage) => setStage(job.id, stage)}
      deleting={deleting}
      onDelete={handleDelete}
    />
  );
}

function JobDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <main
        role="alert"
        className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-20 text-center"
      >
        <h1 className="text-2xl">We couldn&rsquo;t load this job</h1>
        <LoadErrorHint onRetry={onRetry} />
      </main>
    </div>
  );
}

function DetailMissing() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<BrandLogo href="/board" />} />
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
  scenes: React.ReactNode;
  error: string | null;
  dismissError: () => void;
  onPatch: (patch: JobPatch) => Promise<boolean>;
  onStage: (stage: Stage) => void;
  /** Whether a delete for this Job is on its way — disables the confirmation while it is. */
  deleting: boolean;
  onDelete: () => Promise<boolean>;
};

/**
 * Text the user edits in one sitting and saves with a button. The draft is `null` while untouched,
 * so the field follows what the server holds until the user types, and again once a save is
 * accepted. A refused save leaves the text in the field, with the button live again, so there is
 * something to fix rather than retype.
 */
function useSavedText(
  saved: string,
  save: (value: string) => Promise<boolean>,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  return {
    value,
    // False while a save is in flight too: the optimistic value already matches the draft.
    changed: value !== saved,
    set: setDraft,
    save: async () => {
      const sent = value;
      const ok = await save(sent);
      if (ok) setDraft((current) => (current === sent ? null : current));
      return ok;
    },
  };
}

function SaveRow({
  changed,
  onSave,
  children,
}: {
  changed: boolean;
  onSave: () => Promise<unknown>;
  children: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-3">
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {changed ? "Unsaved changes" : null}
      </span>
      <Button
        type="button"
        className="h-9 px-3.5"
        disabled={!changed}
        onClick={() => void onSave()}
      >
        {children}
      </Button>
    </div>
  );
}

/**
 * A shortcut to the Cover letter section, which sits at the foot of the main column below the
 * Description and Notes. Tinted the same as that section, so the two read as one thing split across
 * the page. Nothing to jump to for a Rejected job that never got a Draft, so the card sits out rather
 * than pointing at an empty prompt for an application that's already closed.
 */
/**
 * Straight into this Job's Interview Simulator, skipping the hub's picker (interview simulator
 * ticket 07). Beside the cover letter's card, because the two are the same kind of thing: what this
 * application does with a Job once the posting and the resume are on it.
 *
 * Shown on every Plan and at every Stage. A Tenant not on `pro` lands on the locked start screen,
 * which is the point of the preview; and a Job at `interviewing` is exactly the one worth rehearsing
 * for, so nothing here reads the Stage.
 */
function InterviewJumpCard({ job }: { job: Job }) {
  return (
    <Card className="bg-accent/70 ring-primary/15 [--card-spacing:--spacing(4)]">
      <CardContent className="flex flex-col">
        <p className="text-sm">
          Rehearse for this interview against questions written from this
          posting and your resume.
        </p>
        <Button asChild variant="outline" className="mt-3 h-9 px-3.5">
          <Link href={`/interview/${job.id}`}>
            <MessagesSquare aria-hidden="true" />
            Practice interview
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CoverLetterJumpCard({ job }: { job: Job }) {
  const hasDraft = job.draft.trim().length > 0;
  if (!hasDraft && job.stage === "rejected") return null;

  return (
    <Card className="bg-accent/70 ring-primary/15 [--card-spacing:--spacing(4)]">
      <CardContent className="flex flex-col">
        <p className="text-sm">
          {hasDraft
            ? "Your draft is ready to copy."
            : "Generate a unique cover letter based on the job description and your selected resume."}
        </p>
        <Button asChild className="mt-3 h-9 px-3.5">
          <a href="#cover-letter">
            <Sparkles aria-hidden="true" />
            Cover Letter
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Removes the Job for good, placed under Activity so it reads as the last thing on the page rather
 * than a stray control beside the writing. Confirmed the same way a Contact's delete is, except the
 * dialog stays open and un-dismissable — the close button, Escape, the overlay, and "Keep job" all
 * go through `deleting` — while the delete is in flight: a stray dismissal can't outrun a delete
 * that then succeeds anyway. `deleting` comes from the page above, which uses it to hold this Job on
 * screen through the render or two between the cache dropping it and the navigation landing, rather
 * than flashing "not on your trail" for a Job the user just chose to remove.
 */
function DeleteJobCard({
  job,
  deleting,
  onDelete,
}: {
  job: Job;
  deleting: boolean;
  onDelete: () => Promise<boolean>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  async function handleDelete() {
    const ok = await onDelete();
    if (!ok) setConfirmOpen(false);
  }

  return (
    <>
      <Card
        role="region"
        aria-labelledby="delete-job-heading"
        className="ring-destructive/25 [--card-spacing:--spacing(5)]"
      >
        <CardHeader>
          <CardTitle className="text-lg">
            <h2 id="delete-job-heading">Delete this job</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Removes {job.role} at {job.company} from your board, for good — its
            activity goes with it. Documents and contacts linked to it are
            untouched.
          </p>
          <Button
            ref={deleteTrigger}
            type="button"
            variant="destructive"
            className="mt-4 h-9 px-3.5"
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete job
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
      >
        <DialogContent
          // Opened without a DialogTrigger, so Radix has nowhere to return focus: send it back to
          // the button that opened the confirmation.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            deleteTrigger.current?.focus();
          }}
          className="gap-0 p-6 sm:max-w-md"
        >
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">
              Delete {job.role} at {job.company}?
            </DialogTitle>
            <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
            <Button
              variant="outline"
              className="h-10 px-4"
              disabled={deleting}
              onClick={() => setConfirmOpen(false)}
            >
              Keep job
            </Button>
            <Button
              variant="destructive"
              className="h-10 px-4"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Each free-text field is saved by its own button, so a long paste is never saved mid-edit. */
function JobDetailView({
  job,
  scenes,
  error,
  dismissError,
  onPatch,
  onStage,
  deleting,
  onDelete,
}: JobDetailViewProps) {
  const description = useSavedText(job.description, (value) =>
    onPatch({ description: value }),
  );
  const notes = useSavedText(job.notes, (value) => onPatch({ notes: value }));
  const rejectionLetter = useSavedText(job.rejectionLetter, (value) =>
    onPatch({ rejectionLetter: value }),
  );
  const posting = webLink(job.postingUrl);
  const rejected = job.stage === "rejected";

  // A saved description opens as an excerpt to save room for the Draft below; there is nothing to
  // excerpt until it holds something, and only Save — never this state on its own — closes it again.
  const [editingDescription, setEditingDescription] = useState(false);
  const hasDescription = job.description.trim().length > 0;
  const descriptionExpanded = editingDescription || !hasDescription;
  async function saveDescription() {
    if (await description.save()) setEditingDescription(false);
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<BrandLogo href="/board" />} />

      <main className="flex flex-1 flex-col">
        <SummitHeaderFrame
          stage={job.stage}
          scenes={scenes}
          title={
            <>
              <CompanyAvatar
                company={job.company}
                accent={job.accent}
                size="lg"
                className="lg:size-16 lg:rounded-lg lg:text-3xl self-start"
              />
              <div className="min-w-0">
                <h1 className="text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl 2xl:text-6xl">
                  {job.role}
                </h1>
                <p className="mt-1 sm:text-lg lg:mt-2 lg:text-xl">
                  {job.company} · {job.location}
                </p>
              </div>
            </>
          }
          controls={
            <>
              <Select
                value={job.stage}
                onValueChange={(next) => onStage(next as Stage)}
              >
                <SelectTrigger
                  className="h-9 w-full min-w-32 bg-card sm:w-40"
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

              <EditJobDialog job={job} onPatch={onPatch} />

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
            </>
          }
          progress={<SummitProgress stage={job.stage} />}
        />

        <PageMain as="div">
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

          {/* The side cards in one column beside the writing, and in two from `2xl`, where one column
              of text boxes would otherwise run the full width of the page. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_43.5rem]">
            <div className="min-w-0 space-y-6">
              <section
                aria-labelledby="description-heading"
                className="rounded-lg bg-card p-5 ring-1 ring-foreground/10"
              >
                <h2 id="description-heading" className="text-lg">
                  Job description
                </h2>
                <Excerpt
                  expanded={descriptionExpanded}
                  onToggle={() => setEditingDescription(true)}
                  collapsedLabel="Edit"
                  controlsId="description-body"
                  preview={job.description}
                  previewClassName="mt-3 text-muted-foreground"
                >
                  <div id="description-body">
                    <p
                      id="description-hint"
                      className="mt-1 text-sm text-muted-foreground"
                    >
                      Copy and paste this from the job post website — it feeds
                      your cover letter later.
                    </p>
                    <Textarea
                      aria-labelledby="description-heading"
                      aria-describedby="description-hint"
                      value={description.value}
                      onChange={(event) => description.set(event.target.value)}
                      className="mt-3 min-h-56 resize-y"
                    />
                    <SaveRow
                      changed={description.changed}
                      onSave={saveDescription}
                    >
                      Save description
                    </SaveRow>
                  </div>
                </Excerpt>
              </section>

              {rejected && (
                <section
                  aria-labelledby="rejection-letter-heading"
                  className="rounded-lg bg-card p-5 ring-1 ring-foreground/10"
                >
                  <h2 id="rejection-letter-heading" className="text-lg">
                    Rejection letter
                  </h2>
                  <p
                    id="rejection-letter-hint"
                    className="mt-1 text-sm text-muted-foreground"
                  >
                    Paste the message you received — kept for reference.
                  </p>
                  <Textarea
                    aria-labelledby="rejection-letter-heading"
                    aria-describedby="rejection-letter-hint"
                    value={rejectionLetter.value}
                    onChange={(event) =>
                      rejectionLetter.set(event.target.value)
                    }
                    className="mt-3 min-h-40 resize-y"
                  />
                  <SaveRow
                    changed={rejectionLetter.changed}
                    onSave={rejectionLetter.save}
                  >
                    Save rejection letter
                  </SaveRow>
                </section>
              )}

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

              <CoverLetterCard job={job} id="cover-letter" />
            </div>

            <aside className="grid min-w-0 grid-cols-1 items-start gap-6 2xl:grid-cols-2">
              <div className="min-w-0 space-y-6">
                <CoverLetterJumpCard job={job} />
                <InterviewJumpCard job={job} />
                <DetailsCard job={job} onChange={onPatch} />
                <ApplicationKitCard job={job} />
              </div>
              <div className="min-w-0 space-y-6">
                <ContactsCard job={job} />
                <ActivityCard entries={job.activity} />
                <DeleteJobCard
                  job={job}
                  deleting={deleting}
                  onDelete={onDelete}
                />
              </div>
            </aside>
          </div>
        </PageMain>
      </main>
    </div>
  );
}
