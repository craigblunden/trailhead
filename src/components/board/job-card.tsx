import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { CompanyAvatar } from "@/components/company-avatar";
import { MetaChip } from "@/components/meta-chip";
import { formatSalary, timelineLabel, webLink, type Job } from "@/lib/jobs";

export function JobCard({ job }: { job: Job }) {
  const posting = webLink(job.postingUrl);

  return (
    <li className="relative rounded-md bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="flex items-start gap-2.5">
        <CompanyAvatar company={job.company} accent={job.accent} />
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-sm leading-snug font-bold">
            {/* Stretched link: the whole card opens the job, while the posting
                link below stays independently clickable. */}
            <Link
              href={`/board/${job.id}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-['']"
            >
              {job.role}
            </Link>
          </h3>
          <p className="truncate text-xs text-muted-foreground">{job.company}</p>
        </div>
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
