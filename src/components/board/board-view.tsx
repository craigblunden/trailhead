"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { AddJobDialog } from "@/components/board/add-job-dialog";
import { BoardColumn } from "@/components/board/board-column";
import { AppHeader } from "@/components/app-header";
import { useJobs } from "@/components/jobs-provider";
import { TrailheadLogo } from "@/components/trailhead-logo";
import { TrailScene } from "@/components/trail-scene";
import { Button } from "@/components/ui/button";
import {
  ACTIVE_STAGES,
  STAGES,
  pluralize,
  type Job,
  type Stage,
} from "@/lib/jobs";

export function BoardView() {
  const { jobs } = useJobs();
  const [addOpen, setAddOpen] = useState(false);
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
        leading={<TrailheadLogo href="/board" />}
        actions={
          <Button className="h-9 px-3.5" onClick={openAddJob}>
            <Plus aria-hidden="true" />
            Add job
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl tracking-tight">Your trail</h1>
          <p className="text-sm text-muted-foreground">
            {pluralize(activeCount, "active application")}
          </p>
        </div>

        {jobs.length === 0 ? (
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
          <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {STAGES.map((stage) => (
              <BoardColumn key={stage} stage={stage} jobs={byStage[stage]} />
            ))}
          </div>
        )}
      </main>

      <TrailScene variant="trail" />

      <AddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        returnFocusTo={addTrigger}
      />
    </div>
  );
}
