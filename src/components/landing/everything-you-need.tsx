import { ArrowUpRight, FileText, Sparkles } from "lucide-react";

import { CompanyAvatar } from "@/components/company-avatar";
import {
  SectionTrail,
  TrailMarker,
} from "@/components/landing/section-trail";
import { MetaChip } from "@/components/meta-chip";
import {
  ACTIVE_STAGES,
  STAGE_META,
  formatSalary,
  formatShortDate,
  pluralize,
  timelineLabel,
  type Job,
  type Stage,
} from "@/lib/jobs";
import { SAMPLE_JOBS } from "@/components/landing/sample-jobs";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/*
 * Every miniature below is built from the same seed data, stage metadata,
 * chips, and avatars the real board and job page use, so what a visitor sees
 * here is what they get after signing up. The miniatures are decorative: the
 * copy beside each one carries the meaning for assistive tech.
 */

const boardJobs = ACTIVE_STAGES.map((stage) => ({
  stage,
  jobs: SAMPLE_JOBS.filter((job) => job.stage === stage).slice(0, 2),
}));

const activeCount = SAMPLE_JOBS.filter((job) =>
  ACTIVE_STAGES.includes(job.stage),
).length;

const detailJob = SAMPLE_JOBS.find(
  (job) => job.id === "harvest-lead-product-designer",
) as Job;

/* ---------- Miniature: the board ---------- */

function MiniJobCard({ job }: { job: Job }) {
  return (
    <li className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
      <div className="flex items-start gap-2">
        <CompanyAvatar
          company={job.company}
          accent={job.accent}
          className="size-6 text-[0.65rem]"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs leading-snug font-bold">{job.role}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {job.company}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <MetaChip className="px-1.5 py-0.5 text-[0.65rem]">
          {job.location}
        </MetaChip>
        <MetaChip className="px-1.5 py-0.5 text-[0.65rem]">
          {formatSalary(job)}
        </MetaChip>
      </div>
      <p className="mt-2 border-t border-border pt-1.5 text-[0.65rem] text-muted-foreground">
        {timelineLabel(job)}
      </p>
    </li>
  );
}

function MiniColumn({ stage, jobs }: { stage: Stage; jobs: Job[] }) {
  const { label, dot } = STAGE_META[stage];
  return (
    <div className="flex flex-col rounded-md bg-card/55 ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
        <span
          style={{ backgroundColor: dot }}
          className="size-1.5 shrink-0 rounded-full"
        />
        <span className="text-[0.6rem] font-bold tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
        <span className="ml-auto rounded-sm bg-muted px-1 py-0.5 text-[0.6rem] leading-none font-medium text-muted-foreground">
          {jobs.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2 p-2">
        {jobs.map((job) => (
          <MiniJobCard key={job.id} job={job} />
        ))}
      </ul>
    </div>
  );
}

function MiniBoard() {
  return (
    <div
      aria-hidden="true"
      className="scene-wash rounded-lg p-3 ring-1 ring-foreground/10 sm:p-4"
    >
      <div className="mb-3 flex items-baseline gap-2 px-0.5">
        <span className="font-heading text-base tracking-tight">Your trail</span>
        <span className="text-[0.7rem] text-muted-foreground">
          {pluralize(activeCount, "active application")}
        </span>
      </div>
      <div className="grid grid-cols-2 items-start gap-2 lg:grid-cols-4">
        {boardJobs.map(({ stage, jobs }) => (
          <MiniColumn key={stage} stage={stage} jobs={jobs} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Miniature: one application ---------- */

function MiniButton({
  children,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[0.65rem] font-medium",
        variant === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground ring-1 ring-input",
        className,
      )}
    >
      {children}
    </span>
  );
}

function MiniDetail() {
  const job = detailJob;
  return (
    <div
      aria-hidden="true"
      className="rounded-lg bg-background p-3 ring-1 ring-foreground/10 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <CompanyAvatar
            company={job.company}
            accent={job.accent}
            className="size-8 rounded-md text-sm"
          />
          <div className="min-w-0">
            <p className="font-heading text-base leading-tight tracking-tight">
              {job.role}
            </p>
            <p className="truncate text-[0.7rem] text-muted-foreground">
              {job.company} · {job.location}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MiniButton variant="outline">
            <span
              style={{ backgroundColor: STAGE_META[job.stage].dot }}
              className="size-1.5 rounded-full"
            />
            {STAGE_META[job.stage].label}
          </MiniButton>
          <MiniButton className="hidden sm:inline-flex">
            Open posting
            <ArrowUpRight className="size-3" />
          </MiniButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
        <div className="space-y-2.5">
          <div className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
            <p className="text-xs font-bold">Job description</p>
            <p className="mt-1 line-clamp-3 text-[0.7rem] leading-relaxed text-muted-foreground">
              {job.description}
            </p>
          </div>
          <div className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
            <p className="text-xs font-bold">Notes</p>
            <p className="mt-1 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
              {job.notes}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
            <p className="text-[0.6rem] font-bold tracking-widest text-muted-foreground uppercase">
              Resume sent
            </p>
            <p className="mt-1 flex items-center gap-1 text-[0.7rem] font-medium">
              <FileText className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{job.resume?.fileName}</span>
            </p>
          </div>
          <div className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
            <p className="text-xs font-bold">Activity</p>
            <ol className="mt-1.5">
              {job.activity.slice(0, 3).map((entry, index, all) => (
                <li key={entry.id} className="relative flex gap-2 pb-2 last:pb-0">
                  {index < all.length - 1 && (
                    <span className="absolute top-2.5 bottom-0 left-[2.5px] w-px bg-border" />
                  )}
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[0.7rem] leading-tight font-bold">
                      {entry.label}
                    </span>
                    <span className="block text-[0.6rem] text-muted-foreground">
                      {formatShortDate(entry.date)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Miniature: the cover letter and its Feedback box ---------- */

/** The live card in small: the source line, the write button, a letter, and a Feedback box beneath it. */
function MiniCoverLetter() {
  const job = detailJob;
  return (
    <div
      aria-hidden="true"
      className="rounded-lg bg-background p-3 ring-1 ring-foreground/10 sm:p-4"
    >
      <div className="rounded-md bg-accent/70 p-2.5 ring-1 ring-primary/15">
        <p className="text-xs font-bold">Cover letter</p>
        <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
          Written from the job description and {job.resume?.fileName}.
        </p>
        <MiniButton className="mt-2.5">
          <Sparkles className="size-3" />
          Write cover letter
        </MiniButton>
      </div>

      <div className="mt-2.5 rounded-md bg-card p-3 ring-1 ring-foreground/10">
        <p className="text-[0.7rem] leading-relaxed">
          Dear {job.contacts[0]?.name ?? "hiring team"},
        </p>
        <p className="mt-1.5 text-[0.7rem] leading-relaxed text-foreground/80">
          I&rsquo;m writing about the {job.role} role at {job.company}. Building
          out a merchant experience is exactly the kind of work I&rsquo;ve led
          for the last four years, most recently on a marketplace redesign.
        </p>
        {/* The rest of the letter, in outline. */}
        <div className="mt-2.5 space-y-1.5">
          <div className="h-1.5 w-11/12 rounded-full bg-muted" />
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="h-1.5 w-3/5 rounded-full bg-muted" />
        </div>
      </div>

      {/* The Feedback box and Rewrite, as they sit under a letter on the job page. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="flex h-6 min-w-0 flex-1 basis-40 items-center truncate rounded-md bg-card px-2 text-[0.65rem] text-muted-foreground ring-1 ring-input">
          Shorter, and lead with the marketplace redesign
        </span>
        <MiniButton>
          <Sparkles className="size-3" />
          Rewrite
        </MiniButton>
      </div>
    </div>
  );
}

/* ---------- Section ---------- */

type FeatureProps = {
  id: string;
  heading: string;
  children: React.ReactNode;
  preview: React.ReactNode;
};

/** One stop on the trail: copy beside its miniature on large screens. */
function Feature({ id, heading, children, preview }: FeatureProps) {
  return (
    <li className="relative pl-8 sm:pl-16">
      <TrailMarker />
      <article
        aria-labelledby={id}
        className="flex flex-col gap-6 rounded-xl bg-muted p-6 sm:p-7 lg:flex-row lg:items-start lg:gap-10"
      >
        <div className="max-w-md lg:w-72 lg:shrink-0">
          <h3 id={id} className="text-xl">
            {heading}
          </h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">
            {children}
          </p>
        </div>
        <div className="min-w-0 lg:flex-1">{preview}</div>
      </article>
    </li>
  );
}

export const EveryThingYouNeed = () => {
  return (
    <section
      aria-labelledby="everything-heading"
      className="basecamp-wash overflow-hidden pt-16 sm:pt-20"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="everything-heading" className="text-3xl tracking-tight sm:text-4xl">
            Learn from every application
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
            When replies are scarce, a clear record is how you find out what
            lands. What you see below is the product itself, filled with a
            sample search.
          </p>
        </div>

        {/* The trail runs down the left, with a marker at each stop, and
            carries on past the last one toward the call to action. */}
        <ol className="relative mt-10 flex flex-col gap-6 pb-20">
          <SectionTrail />

          <Feature
            id="feature-board"
            heading="See where your search stands"
            preview={<MiniBoard />}
          >
            Move roles from Interested through Applied, Interviewing, and Offer
            — or Rejected, so nothing quietly disappears. At a glance, you can
            see what&rsquo;s moving and where things stall.
          </Feature>

          <Feature
            id="feature-page"
            heading="Remember exactly what you sent"
            preview={<MiniDetail />}
          >
            The resume you used, the posting and its description, your
            contacts, notes, and a dated timeline of every move. When one turns
            into an interview, you can look back at what got you there.
          </Feature>

          <Feature
            id="feature-cover"
            heading="A cover letter for this application"
            preview={<MiniCoverLetter />}
          >
            Written fresh for each job from its own posting and the resume you
            attached to it, nothing generic and nothing reused between jobs. Read
            it, tell {BRAND_NAME} what should change, and it rewrites from your
            feedback.
          </Feature>
        </ol>
      </div>
    </section>
  );
};
