"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";

import { CompanyAvatar } from "@/components/company-avatar";
import { MetaChip } from "@/components/meta-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { writeJobTransfer } from "@/lib/board-dnd";
import { STAGES, STAGE_META, formatSalary, timelineLabel, webLink, type Job, type Stage } from "@/lib/jobs";

type JobCardProps = {
  job: Job;
  /** Move this Job to another Stage — from the menu, or by being dropped on a column. */
  onMove: (stage: Stage) => void;
};

export function JobCard({ job, onMove }: JobCardProps) {
  const posting = webLink(job.postingUrl);
  const [dragging, setDragging] = useState(false);

  function onDragStart(event: React.DragEvent) {
    writeJobTransfer(event.dataTransfer, job.id);
    setDragging(true);
  }

  return (
    <li
      draggable
      data-dragging={dragging || undefined}
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      className="relative rounded-md bg-card p-3 ring-1 ring-foreground/10 transition-[box-shadow,opacity] hover:ring-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 data-[dragging=true]:opacity-50"
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar company={job.company} accent={job.accent} />
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-sm leading-snug font-bold">
            {/* Stretched link: the whole card opens the job, while the posting
                link and the move menu stay independently clickable. A link is
                draggable on its own, so it is told not to be: a drag that starts
                on the role name moves the card, not the link's URL. */}
            <Link
              href={`/board/${job.id}`}
              draggable={false}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-['']"
            >
              {job.role}
            </Link>
          </h3>
          <p className="truncate text-xs text-muted-foreground">{job.company}</p>
        </div>

        {/* Drag and drop is pointer-only. The menu is how a keyboard, a screen
            reader, or a touch browser without native drag moves a Job from here. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
              aria-label={`Move ${job.role} at ${job.company}`}
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {STAGES.filter((stage) => stage !== job.stage).map((stage) => (
              <DropdownMenuItem key={stage} onSelect={() => onMove(stage)}>
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: STAGE_META[stage].dot }}
                  className="size-2 shrink-0 rounded-full"
                />
                {STAGE_META[stage].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <MetaChip>{job.location}</MetaChip>
        <MetaChip>{formatSalary(job)}</MetaChip>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>{timelineLabel(job)}</span>
        {/* No usable URL means no link — an empty href would just reload the board. */}
        {posting && (
          <a
            href={posting}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            className="relative z-10 inline-flex items-center gap-0.5 rounded-sm font-bold text-foreground/70 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Posting
            <ArrowUpRight className="size-3" aria-hidden="true" />
            <span className="sr-only">for {job.role} at {job.company}, opens in a new tab</span>
          </a>
        )}
      </div>
    </li>
  );
}
