"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { CompanyAvatar } from "@/components/company-avatar";
import { ScoreStars } from "@/components/interview/score-stars";
import { Scorecard } from "@/components/interview/scorecard";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import type { Attempt, PastAttempt } from "@/lib/interview";
import { formatShortDate, type Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * The Tenant's past interviews (interview second pass ticket 06): a list on the hub, below the picker,
 * and each scored one's Scorecard at a link of its own to come back to.
 */

/**
 * Every scored Attempt across the Tenant's Jobs, and the one in progress for a Job, newest first. A
 * scored row opens that Attempt's Scorecard; the row in progress offers Resume and goes to its Job's
 * page, where Resume is. Absent altogether when there is nothing to list — no empty frame.
 */
export function PastInterviews({ attempts }: { attempts: PastAttempt[] }) {
  if (attempts.length === 0) return null;
  return (
    <section aria-labelledby="past-interviews" className="mt-2">
      <h2 id="past-interviews" className="text-xl">
        Past interviews
      </h2>
      <ul className="mt-3 space-y-1.5">
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            <PastRow attempt={attempt} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PastRow({ attempt }: { attempt: PastAttempt }) {
  const inProgress = attempt.status === "in-progress";
  return (
    <Link
      href={inProgress ? `/interview/${attempt.jobId}` : `/interview/${attempt.jobId}/${attempt.id}`}
      className={cn(
        "flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card/70 px-3 py-2.5 outline-none",
        "hover:border-primary/50 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <CompanyAvatar company={attempt.company} accent={attempt.accent} />
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate font-medium">{attempt.role}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {attempt.company} · {formatShortDate(attempt.startedOn)} · {attempt.length} min
        </span>
      </span>
      {inProgress ? (
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          Resume
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      ) : (
        attempt.overall !== null && <ScoreStars score={attempt.overall} />
      )}
    </Link>
  );
}

/** What the past Scorecard's page knows about its Job: enough to name it. */
export type PastScorecardJob = Pick<Job, "id" | "company" | "role">;

/**
 * One past Attempt's Scorecard, view-only: nothing here scores, resumes, or starts anything. The way
 * back is to the hub's list, and on to rehearsing the same Job again from its own page.
 */
export function PastScorecard({ job, attempt }: { job: PastScorecardJob; attempt: Attempt }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/interview">
          <ArrowLeft aria-hidden="true" />
          All interviews
        </Link>
      </Button>
      <h1 className="text-3xl tracking-tight text-balance">
        {job.role} at {job.company}
      </h1>
      <p className="mt-1 text-muted-foreground">An interview you rehearsed, and how it went.</p>

      <div className="mt-8">
        <Scorecard attempt={attempt} />
      </div>

      <Button asChild variant="outline" className="mt-6 h-10 px-5">
        <Link href={`/interview/${job.id}`}>Rehearse this job again</Link>
      </Button>
    </div>
  );
}

/** The page around it: the header every signed-in page has, and the page's own frame. */
export function PastScorecardPage({ job, attempt }: { job: PastScorecardJob; attempt: Attempt }) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <PastScorecard job={job} attempt={attempt} />
      </PageMain>
    </div>
  );
}
