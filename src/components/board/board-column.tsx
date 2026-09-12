"use client";

import { useRef, useState } from "react";

import { JobCard } from "@/components/board/job-card";
import { carriesJob, readJobTransfer } from "@/lib/board-dnd";
import { STAGE_META, pluralize, type Job, type Stage } from "@/lib/jobs";

type BoardColumnProps = {
  stage: Stage;
  jobs: Job[];
  /** Move a Job to a Stage: this one, when a card is dropped here, or the one its menu chose. */
  onMove: (jobId: string, stage: Stage) => void;
};

export function BoardColumn({ stage, jobs, onMove }: BoardColumnProps) {
  const headingId = `stage-${stage}`;
  const { label, dot } = STAGE_META[stage];
  const [over, setOver] = useState(false);
  // `dragenter`/`dragleave` fire for every child the pointer crosses, so "still over the column"
  // is a depth, not a flag: lit on the first enter, unlit only when the last leave balances it.
  const depth = useRef(0);

  function clearTarget() {
    depth.current = 0;
    setOver(false);
  }

  function onDragEnter(event: React.DragEvent) {
    if (!carriesJob(event.dataTransfer)) return;
    depth.current += 1;
    setOver(true);
  }

  function onDragLeave(event: React.DragEvent) {
    if (!carriesJob(event.dataTransfer)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }

  function onDragOver(event: React.DragEvent) {
    // Only a Job may land here; anything else keeps the browser's default of refusing the drop.
    if (!carriesJob(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: React.DragEvent) {
    const jobId = readJobTransfer(event.dataTransfer);
    if (jobId === null) return;
    event.preventDefault();
    clearTarget();
    onMove(jobId, stage);
  }

  return (
    <section
      aria-labelledby={headingId}
      data-drop-target={over || undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex h-fit flex-col rounded-lg bg-card/55 ring-1 ring-foreground/10 transition-[box-shadow,background-color] data-[drop-target=true]:bg-accent/70 data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-primary/60"
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
            <JobCard key={job.id} job={job} onMove={(next) => onMove(job.id, next)} />
          ))}
        </ul>
      )}
    </section>
  );
}
