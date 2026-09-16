"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { CompanyAvatar } from "@/components/company-avatar";
import { useJobs } from "@/components/jobs-provider";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { PlanBlaze } from "@/components/plan-mark";
import { canStartAttempt } from "@/lib/interview";
import { STAGE_META, pluralize, type Job } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";

/**
 * `/interview`: which Job to rehearse for (interview simulator ticket 07).
 *
 * The picker is the pattern already used to find a Contact to link to a Job — a search box over a
 * capped, scrollable, ungrouped list — rather than the board's grouped columns. A Tenant here has
 * already decided to rehearse and only needs to find one row; the board's shape answers a different
 * question ("where is everything up to?") and would make this one harder.
 *
 * Every Plan sees this page. A Tenant not on `pro` follows the same links to the same locked start
 * screen, so the feature is never hidden from the people it is meant to sell to.
 */

/** More than this and the Tenant should type a little more; the list stays scannable. */
const MAX_RESULTS = 8;

export function InterviewHub({ plan }: { plan: Plan }) {
  const fieldId = useId();
  const { jobs, status } = useJobs();
  const [query, setQuery] = useState("");
  const locked = !canStartAttempt(plan);

  const term = query.trim().toLowerCase();
  const matches = term
    ? jobs.filter((job) => [job.role, job.company].some((value) => value.toLowerCase().includes(term)))
    : jobs;
  const shown = matches.slice(0, MAX_RESULTS);

  let summary: string;
  if (status === "pending") summary = "Loading your jobs…";
  else if (status === "error") summary = "We couldn’t load your jobs. Reload the page to try again.";
  else if (jobs.length === 0) summary = "Add a job to your board first — the questions come from its posting.";
  else if (term) summary = matches.length === 0 ? "No matching jobs." : `${pluralize(matches.length, "match")}.`;
  else summary = `${pluralize(jobs.length, "job")} on your board.`;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl tracking-tight">
          Interview practice
          {locked && (
            <span className="flex items-center gap-1.5 rounded-full border border-primary/30 px-2 py-0.5 text-xs font-medium text-primary">
              <PlanBlaze plan="pro" />
              Pro
            </span>
          )}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Rehearse for one job against questions written from its posting and your own resume, answered
          out loud and against the clock, then scored.
        </p>

        <div className="mt-6 max-w-2xl space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={fieldId} className="text-sm font-medium">
              Which job are you rehearsing for?
            </label>
            <input
              id={fieldId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Role or company"
              autoComplete="off"
              aria-describedby={`${fieldId}-summary`}
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {status === "pending" ? (
            <LoadingTrail>Loading your jobs…</LoadingTrail>
          ) : (
            <p id={`${fieldId}-summary`} role="status" className="text-sm text-muted-foreground">
              {summary}
            </p>
          )}

          {shown.length > 0 && (
            // Capped and scrolled, so a Tenant with thirty jobs opens the same short list as one
            // with three: the search box stays in view without scrolling.
            <ul aria-label="Matching jobs" className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
              {shown.map((job) => (
                <li key={job.id}>
                  <JobRow job={job} />
                </li>
              ))}
            </ul>
          )}

          {matches.length > shown.length && (
            <p className="text-xs text-muted-foreground">
              {matches.length - shown.length} more — type a little to narrow it down.
            </p>
          )}
        </div>
      </PageMain>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  return (
    <Link
      href={`/interview/${job.id}`}
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 outline-none hover:border-primary/60 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CompanyAvatar company={job.company} accent={job.accent} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{job.role}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {job.company} · {STAGE_META[job.stage].label}
        </span>
      </span>
    </Link>
  );
}
