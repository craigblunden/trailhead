"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { PracticeAnswers, ScoringOnPro } from "@/components/interview/practice-read-back";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import {
  PRACTICE_QUESTION_COUNT,
  canStartPracticeRound,
  type PastPracticeRound,
  type PracticeRound,
} from "@/lib/practice";
import { cn } from "@/lib/utils";

/**
 * The Tenant's saved Practice rounds (practice round ticket 05): a list on the hub, and each finished
 * round's read-back at a link of its own. Never scored, on any Plan — a Tenant who has since moved to
 * `pro` still reads them back, and is offered nothing to score or start.
 */

/** Every finished round, newest first. Absent altogether when there is nothing to list — no empty frame. */
export function PracticeRounds({ rounds }: { rounds: PastPracticeRound[] }) {
  if (rounds.length === 0) return null;
  return (
    <section aria-labelledby="practice-rounds" className="mt-8">
      <h2 id="practice-rounds" className="text-xl">
        Practice rounds
      </h2>
      <ul className="mt-3 space-y-1.5">
        {rounds.map((round) => (
          <li key={round.id}>
            <Link
              href={`/interview/practice/${round.id}`}
              className={cn(
                "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card/70 px-3 py-2.5 outline-none",
                "hover:border-primary/50 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50",
              )}
            >
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-medium">Practice round</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatShortDate(round.startedOn)} · {round.answered} of {PRACTICE_QUESTION_COUNT} answered
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                Not scored
                <ChevronRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One saved round, read back, view-only. The way back is to the hub; a Plan that can take another is
 * offered one, and shown what scoring would add. A Plan with the full Simulator is told only that
 * practice rounds are not scored.
 */
export function SavedPracticeRound({ round, plan }: { round: PracticeRound; plan: Plan }) {
  const practising = canStartPracticeRound(plan);
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/interview">
              <ArrowLeft aria-hidden="true" />
              Interview Simulator
            </Link>
          </Button>
          <h1 className="text-3xl tracking-tight">Practice round</h1>
          <p className="mt-1 text-muted-foreground">
            {practising
              ? `What you said on ${formatShortDate(round.startedAt.slice(0, 10))}.`
              : `What you said on ${formatShortDate(round.startedAt.slice(0, 10))}. Practice rounds are not scored.`}
          </p>

          <div className="mt-8 space-y-6">
            <h2 className="text-xl">Your answers</h2>
            <PracticeAnswers round={round} />
            {practising && <ScoringOnPro />}
            {practising && (
              <Button asChild className="h-11 px-6 text-base">
                <Link href="/interview/practice">Practise again</Link>
              </Button>
            )}
          </div>
        </div>
      </PageMain>
    </div>
  );
}
