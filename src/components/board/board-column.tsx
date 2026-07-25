import { JobCard } from "@/components/board/job-card";
import { STAGE_META, pluralize, type Job, type Stage } from "@/lib/jobs";

type BoardColumnProps = { stage: Stage; jobs: Job[] };

export function BoardColumn({ stage, jobs }: BoardColumnProps) {
  const headingId = `stage-${stage}`;
  const { label, dot } = STAGE_META[stage];

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-fit flex-col rounded-lg bg-card/55 ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span
          aria-hidden="true"
          style={{ backgroundColor: dot }}
          className="size-2 shrink-0 rounded-full"
        />
        <h2
          id={headingId}
          className="font-sans text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          {label}
        </h2>
        <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[0.7rem] leading-none font-medium text-muted-foreground">
          <span className="sr-only">{pluralize(jobs.length, "application")}</span>
          <span aria-hidden="true">{jobs.length}</span>
        </span>
      </div>

      {jobs.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing at this stage yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 p-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </section>
  );
}
