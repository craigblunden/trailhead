"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { AddJobDialog } from "@/components/board/add-job-dialog";
import { BoardColumn } from "@/components/board/board-column";
import { AppHeader } from "@/components/app-header";
import { useJobs } from "@/components/jobs-provider";
import { BrandLogo } from "@/components/brand-logo";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  ACTIVE_STAGES,
  STAGES,
  STAGE_META,
  pluralize,
  type Job,
  type Stage,
} from "@/lib/jobs";

type BoardViewProps = {
  /**
   * The illustration beneath the board. The server renders it and passes it in, so its code stays out
   * of this component's JavaScript and a change to the jobs never renders it again (performance
   * ticket 04).
   */
  scene?: React.ReactNode;
};

export function BoardView({ scene }: BoardViewProps = {}) {
  const { jobs, status, error, dismissError, reload, getJob, setStage } = useJobs();
  const [addOpen, setAddOpen] = useState(false);
  // What the last move from the board did, for the live region: a card that is dragged or sent
  // to another column leaves the place the user was looking or listening. Counted, so the same
  // move made twice is announced twice — an unchanged string would never reach the DOM. Said as
  // soon as the card moves, like the move itself; a refusal rolls the card back and the error
  // alert says so.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });

  function moveJob(jobId: string, stage: Stage) {
    const job = getJob(jobId);
    if (!job || !setStage(jobId, stage)) return;
    setAnnouncement(({ count }) => ({
      text: `Moved ${job.role} to ${STAGE_META[stage].label}`,
      count: count + 1,
    }));
  }
  // Either the header button or the empty-state button can open the dialog;
  // remember which, so focus goes back to it on close.
  const addTrigger = useRef<HTMLElement | null>(null);

  function openAddJob(event: React.MouseEvent<HTMLButtonElement>) {
    addTrigger.current = event.currentTarget;
    setAddOpen(true);
  }

  const byStage = useMemo(() => {
    const grouped = Object.fromEntries(
      STAGES.map((stage) => [stage, [] as Job[]]),
    ) as Record<Stage, Job[]>;
    for (const job of jobs) grouped[job.stage].push(job);
    return grouped;
  }, [jobs]);

  const activeCount = jobs.filter((job) =>
    ACTIVE_STAGES.includes(job.stage),
  ).length;

  return (
    <div className="scene-wash flex flex-1 flex-col">
      <AppHeader
        leading={<BrandLogo href="/board" />}
        actions={
          <Button className="h-9 px-3.5" onClick={openAddJob}>
            <Plus aria-hidden="true" />
            Add job
          </Button>
        }
      />

      <PageMain>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl tracking-tight">Your trail</h1>
          <p className="text-sm text-muted-foreground">
            {pluralize(activeCount, "active application")}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm"
          >
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={dismissError}>
              Dismiss
            </Button>
          </div>
        )}

        {status === "pending" ? (
          <LoadingTrail className="mt-8">Loading your trail…</LoadingTrail>
        ) : status === "error" ? (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center"
          >
            <h2 className="text-lg">We couldn&rsquo;t load your trail</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Something went wrong on our side. Your jobs are safe — try again in a moment.
            </p>
            <Button className="mt-5 h-10 px-4" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <h2 className="text-lg">No roles on the board yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Add the first posting you&rsquo;re interested in and it will show
              up here.
            </p>
            <Button className="mt-5 h-10 px-4" onClick={openAddJob}>
              <Plus aria-hidden="true" />
              Add job
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {STAGES.map((stage) => (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  jobs={byStage[stage]}
                  onMove={moveJob}
                />
              ))}
            </div>
            <p role="status" aria-live="polite" className="sr-only">
              {announcement.text && <span key={announcement.count}>{announcement.text}</span>}
            </p>
          </>
        )}
      </PageMain>

      {scene}

      <AddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        returnFocusTo={addTrigger}
      />
    </div>
  );
}
