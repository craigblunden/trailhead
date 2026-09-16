"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, Keyboard, Mic } from "lucide-react";

import { CompanyAvatar } from "@/components/company-avatar";
import { useJobs } from "@/components/jobs-provider";
import { LoadingTrail } from "@/components/loading-trail";
import {
  ATTEMPT_LENGTHS,
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_MIX,
  INTERVIEW_FAILURES,
  NOT_READY_LABEL,
  SPEAK_RECOMMENDED,
  SPEAK_UNSUPPORTED,
  readinessOf,
  type AttemptLength,
  type InputMode,
  type Readiness,
} from "@/lib/interview";
import { STAGE_META, pluralize, type Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * The Interview Simulator's first page as one path of steps (interview simulator tickets 05–08; the
 * "One path" layout chosen from the prototype on `prototype/interview-first-page-layouts`): which
 * job, how you'll rehearse, and Go. Each step opens once the one before it is done, so the page asks
 * one question at a time and the order of the steps is the order of the decision.
 *
 * The pieces here are the steps' contents. Which steps show, and what each holds, is the panel's
 * (`interview-panel.tsx`), because it depends on the Job's Attempt.
 */

/** What the path knows about the picked Job: enough to name it, and whether it can be rehearsed. */
export type PathJob = Pick<Job, "id" | "company" | "role" | "accent" | "stage"> & { readiness: Readiness };

export function Path({ children }: { children: React.ReactNode }) {
  return <ol className="mt-8">{children}</ol>;
}

/**
 * One step. `done` shows a tick, `open` shows its contents; a step that isn't open yet shows only its
 * title, muted, so the path ahead is visible before it can be taken.
 */
export function Step({
  number,
  title,
  done = false,
  open,
  last = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  open: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-8">
      {!last && <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-0.5 bg-border" />}
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          done
            ? "bg-primary text-primary-foreground"
            : open
              ? "bg-card ring-2 ring-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-4" /> : number}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 className={cn("text-xl", !open && "text-muted-foreground")}>
          {title}
        </h2>
        {open && children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

/** More than this and the Tenant should type a little more: the step stays one screen tall. */
const SHOWN = 6;

/**
 * Step one with no job chosen: a search over the Tenant's jobs, role or company, as a short ungrouped
 * list (ticket 07). Each row is a link — choosing a job is a navigation to that job's page of the
 * path, so a reload, the back button, and the Job page's own "Practice interview" link all land on
 * the same place.
 */
export function JobPicker() {
  const searchId = useId();
  const { jobs, status } = useJobs();
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const matches = term
    ? jobs.filter((job) => [job.role, job.company].some((value) => value.toLowerCase().includes(term)))
    : jobs;
  const shown = matches.slice(0, SHOWN);

  let summary: string;
  if (status === "error") summary = "We couldn’t load your jobs. Reload the page to try again.";
  else if (jobs.length === 0) summary = "Add a job to your board first — the questions come from its posting.";
  else if (term) summary = matches.length === 0 ? "No matching jobs." : `${pluralize(matches.length, "match")}.`;
  else if (jobs.length > shown.length) summary = `Showing ${shown.length} of ${pluralize(jobs.length, "job")}. Type to narrow it down.`;
  else summary = `${pluralize(jobs.length, "job")} on your board.`;

  return (
    <div>
      <label htmlFor={searchId} className="sr-only">
        Search your jobs by role or company
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by role or company"
        autoComplete="off"
        aria-describedby={`${searchId}-summary`}
        className="h-11 w-full rounded-md border border-border bg-card px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {status === "pending" ? (
        <LoadingTrail className="mt-3">Loading your jobs…</LoadingTrail>
      ) : (
        <>
          {shown.length > 0 && (
            <ul aria-label="Matching jobs" className="mt-3 space-y-1.5">
              {shown.map((job) => (
                <li key={job.id}>
                  <JobRow job={job} href={`/interview/${job.id}`} readiness={readinessOf(job)} />
                </li>
              ))}
            </ul>
          )}
          <p id={`${searchId}-summary`} role="status" className="mt-2 px-1 text-xs text-muted-foreground">
            {summary}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Step one once a job is chosen: that job as a row, a way to choose another, and — when it can't be
 * rehearsed yet — why, with the way to fix it.
 */
export function PickedJob({ job }: { job: PathJob }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <JobRow job={job} readiness={job.readiness} selected />
        </div>
        <Link
          href="/interview"
          aria-label="Change job"
          className="rounded-md px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Change
        </Link>
      </div>
      {job.readiness !== "ready" && (
        <p className="text-sm text-warning">
          {INTERVIEW_FAILURES[job.readiness]}{" "}
          <Link href={`/board/${job.id}`} className="font-medium underline underline-offset-2">
            Open this job
          </Link>
        </p>
      )}
    </div>
  );
}

function JobRow({
  job,
  readiness,
  href,
  selected = false,
}: {
  job: Pick<Job, "company" | "role" | "accent" | "stage">;
  readiness: Readiness;
  href?: string;
  selected?: boolean;
}) {
  const body = (
    <>
      <CompanyAvatar company={job.company} accent={job.accent} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{job.role}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {job.company} · {STAGE_META[job.stage].label}
        </span>
      </span>
      {readiness !== "ready" && (
        <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[0.6875rem] text-chip-foreground">
          {NOT_READY_LABEL[readiness]}
        </span>
      )}
    </>
  );
  const className = cn(
    "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left",
    selected ? "border-primary bg-primary/10" : "border-border bg-card/70",
  );
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        className,
        "outline-none hover:border-primary/50 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * Step two's choices: how long, what that asks across the five areas, and how to answer. Locked (not
 * on `pro`), every choice is shown and none can be made — the real set-up, as a preview (ticket 08).
 */
export function RehearsalChoices({
  locked,
  lengths,
  length,
  onLengthChange,
  mode,
  onModeChange,
  speechSupported,
}: {
  locked: boolean;
  lengths: readonly AttemptLength[];
  length: AttemptLength;
  onLengthChange: (length: AttemptLength) => void;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  speechSupported: boolean;
}) {
  const mix = CATEGORY_MIX[length];
  return (
    <div className="space-y-5">
      <fieldset disabled={locked}>
        <legend className="text-sm font-medium">How long do you have?</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ATTEMPT_LENGTHS.map((option) => (
            <Choice
              key={option}
              selected={option === length}
              disabled={locked || !lengths.includes(option)}
              onClick={() => onLengthChange(option)}
            >
              <span className="block text-lg leading-tight font-semibold tabular-nums">{option}</span>
              <span className="block text-xs">minutes</span>
            </Choice>
          ))}
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        {CATEGORIES.map((category) => `${mix[category]} ${CATEGORY_LABEL[category].toLowerCase()}`).join(", ")}
        {" — every length covers all five areas."}
      </p>

      {speechSupported ? (
        <fieldset disabled={locked}>
          <legend className="text-sm font-medium">How will you answer?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Choice selected={mode === "speak"} disabled={locked} onClick={() => onModeChange("speak")}>
              <span className="flex items-center justify-center gap-1.5">
                <Mic aria-hidden="true" className="size-4" />
                Speaking
              </span>
            </Choice>
            <Choice selected={mode === "type"} disabled={locked} onClick={() => onModeChange("type")}>
              <span className="flex items-center justify-center gap-1.5">
                <Keyboard aria-hidden="true" className="size-4" />
                Typing
              </span>
            </Choice>
          </div>
          {mode === "speak" && <p className="mt-3 text-sm text-muted-foreground">{SPEAK_RECOMMENDED}</p>}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">{SPEAK_UNSUPPORTED}</p>
      )}
    </div>
  );
}

function Choice({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-2 text-center text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
        !disabled && !selected && "hover:border-primary/50 hover:text-foreground",
        disabled && "opacity-55",
      )}
    >
      {children}
    </button>
  );
}
