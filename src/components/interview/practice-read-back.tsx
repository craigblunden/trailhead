import Link from "next/link";
import { Lock } from "lucide-react";

import { PlanBlaze } from "@/components/plan-mark";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, isUnreached } from "@/lib/interview";
import type { PracticeQuestion, PracticeRound } from "@/lib/practice";

/**
 * What a finished Practice round reads back (practice round tickets 04, 05): each question with what
 * the Tenant said, and — where a Scorecard would be — that scoring is part of Pro. Never a score, a
 * placeholder, or a blurred Scorecard: a Practice round is not scored, and nothing here pretends it was.
 * Shown at the end of a round and on a saved round's own page alike.
 */

/** Each question in order, with the Tenant's own answer, or "Not reached" where the clock ran out first. */
export function PracticeAnswers({ round }: { round: PracticeRound }) {
  return (
    <div className="space-y-3">
      {[...round.questions]
        .sort((a, b) => a.order - b.order)
        .map((question) => (
          <PracticeAnswer key={question.id} question={question} />
        ))}
    </div>
  );
}

function PracticeAnswer({ question }: { question: PracticeQuestion }) {
  const headingId = `practice-question-${question.id}`;
  const unreached = isUnreached(question);
  return (
    <article aria-labelledby={headingId} className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-foreground">
          {CATEGORY_LABEL[question.category]}
        </span>
        {unreached && <span className="shrink-0 text-sm text-muted-foreground">Not reached</span>}
      </div>
      <h3 id={headingId} className="font-medium text-balance">
        {question.text}
      </h3>
      {unreached ? (
        <p className="text-sm text-muted-foreground">
          <em>The clock ran out before this one.</em>
        </p>
      ) : (
        <div>
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What you said</h4>
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {question.answer?.transcript.trim() || <em className="text-muted-foreground">You didn’t answer this one.</em>}
          </p>
        </div>
      )}
    </article>
  );
}

/** Where a Scorecard would be: what scoring gives, that it is part of Pro, and where the plans are compared. */
export function ScoringOnPro() {
  return (
    <section aria-labelledby="scoring-on-pro" className="rounded-lg bg-primary/5 p-4 ring-1 ring-primary/20 sm:p-5">
      <h3 id="scoring-on-pro" className="flex items-center gap-2 font-medium">
        <Lock aria-hidden="true" className="size-4 text-primary" />
        Scoring comes with Pro
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        On Pro, every answer is marked in stars, with what landed and what you missed — drawn from the job’s
        posting and your resume — and the interview ends on what to change next time.
      </p>
      <Button asChild variant="outline" className="mt-3 h-9 px-4">
        <Link href="/account#plans">
          <PlanBlaze plan="pro" />
          Compare plans
        </Link>
      </Button>
    </section>
  );
}
