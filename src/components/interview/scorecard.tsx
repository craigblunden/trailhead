"use client";

import { Signpost, Target } from "lucide-react";

import { ScoreStars } from "@/components/interview/score-stars";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  isUnreached,
  rollUp,
  type Attempt,
  type AttemptQuestion,
  type CategoryScore,
  type Scorecard as ScorecardData,
  type TakeawayPoint,
} from "@/lib/interview";

/**
 * The Scorecard (interview simulator ticket 03), read top to bottom in the order a Tenant needs it
 * (interview second pass ticket 05): how it went overall; **For next time**, the Takeaway — the two or
 * three things most worth changing, before any detail; how each area went; then a card per Answer
 * with what landed and the Missed points to reach for next time.
 *
 * Every score reads as stars and a band word, never a bare number (ticket 02). A question the countdown
 * ran out before reads "Not reached", with nothing to score, and so does an area with nothing reached
 * (ticket 03). An Attempt scored before What landed and Missed points existed shows each Answer's single
 * rationale in their place, and has no Takeaway to put first.
 */

export function Scorecard({ attempt, scorecard }: { attempt: Attempt; scorecard?: ScorecardData }) {
  // The rollups are derived from the Answers themselves, so a Scorecard shown on return from a
  // reload reads identically to the one shown the moment it was scored.
  const rolled = scorecard ?? rollUp(attempt.questions);
  const byCategory = new Map(rolled.categories.map((category) => [category.category, category]));
  const unreached = attempt.questions.filter(isUnreached).length;
  const questions = [...attempt.questions].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="scorecard-overall"
        className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15"
      >
        <div className="space-y-1.5">
          <h2 id="scorecard-overall" className="text-sm font-medium text-muted-foreground">
            Overall
          </h2>
          <ScoreStars score={rolled.overall} size="lg" />
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">
          Across {attempt.questions.length} questions in {attempt.length} minutes
          {unreached > 0 && `, ${unreached} of which you didn’t get to`}.
        </p>
      </section>

      {attempt.takeaway.length > 0 && <ForNextTime takeaway={attempt.takeaway} />}

      <section aria-labelledby="scorecard-areas">
        <h2 id="scorecard-areas" className="text-lg font-medium">
          By area
        </h2>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {CATEGORIES.filter((category) => questions.some((question) => question.category === category)).map(
            (category) => (
              <li key={category} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span>{CATEGORY_LABEL[category]}</span>
                <AreaScore rollup={byCategory.get(category)} />
              </li>
            ),
          )}
        </ul>
      </section>

      <section aria-labelledby="scorecard-answers">
        <h2 id="scorecard-answers" className="text-lg font-medium">
          Answer by answer
        </h2>
        <ol className="mt-3 space-y-4">
          {questions.map((question) => (
            <li key={question.id}>
              <AnswerCard question={question} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The Takeaway, first and in the brand colour: what to change, and which Answers it is drawn from. */
function ForNextTime({ takeaway }: { takeaway: TakeawayPoint[] }) {
  return (
    <section aria-labelledby="scorecard-next-time" className="rounded-lg bg-primary/10 p-5 ring-1 ring-primary/30">
      <h2 id="scorecard-next-time" className="flex items-center gap-2 text-lg font-medium text-primary">
        <Signpost aria-hidden="true" className="size-5" />
        For next time
      </h2>
      <ol className="mt-3 space-y-3">
        {takeaway.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{item.point}</p>
              <p className="text-sm text-muted-foreground">From {item.from}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AreaScore({ rollup }: { rollup: CategoryScore | undefined }) {
  if (!rollup) return <span className="text-sm text-muted-foreground">Not scored</span>;
  if (rollup.unreached === rollup.questions) return <NotReached />;
  return <ScoreStars score={rollup.score} />;
}

/** One Answer: the question, its stars, what landed, and the Missed points — or why there is nothing to mark. */
function AnswerCard({ question }: { question: AttemptQuestion }) {
  const headingId = `scorecard-question-${question.id}`;
  const answer = question.answer;
  return (
    <article aria-labelledby={headingId} className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-foreground">
          {CATEGORY_LABEL[question.category]}
        </span>
        {!answer ? <NotReached /> : typeof answer.score === "number" && <ScoreStars score={answer.score} />}
      </div>
      <h3 id={headingId} className="font-medium text-balance">
        {question.text}
      </h3>

      {!answer ? (
        <p className="text-sm text-muted-foreground">
          <em>The clock ran out before this one.</em>
        </p>
      ) : (
        <>
          {answer.whatLanded ? (
            <>
              <div>
                <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What landed</h4>
                <p className="mt-1 text-sm">{answer.whatLanded}</p>
              </div>
              {answer.missedPoints.length > 0 && <MissedPoints points={answer.missedPoints} id={question.id} />}
            </>
          ) : (
            answer.rationale && <p className="border-l-2 border-primary/40 pl-3 text-sm">{answer.rationale}</p>
          )}
          <details className="group text-sm">
            <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              What you said
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              {answer.transcript.trim() || <em>You didn’t answer this one.</em>}
            </p>
          </details>
        </>
      )}
    </article>
  );
}

/** The things this Answer could have reached for, highlighted so they read as the part to act on. */
function MissedPoints({ points, id }: { points: string[]; id: string }) {
  const labelId = `scorecard-missed-${id}`;
  return (
    <div className="rounded-md bg-warning/10 p-3 ring-1 ring-warning/25">
      <h4 id={labelId} className="text-xs font-medium tracking-wide text-warning uppercase">
        Missed points
      </h4>
      <ul aria-labelledby={labelId} className="mt-2 space-y-1.5">
        {points.map((point, index) => (
          <li key={index} className="flex gap-2 text-sm">
            <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where stars would be, for a question — or a whole area — the countdown ran out before. */
function NotReached() {
  return <span className="shrink-0 text-sm text-muted-foreground">Not reached</span>;
}
