"use client";

import { ScoreStars } from "@/components/interview/score-stars";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  rollUp,
  type Attempt,
  type Scorecard as ScorecardData,
} from "@/lib/interview";

/**
 * The Scorecard (interview simulator ticket 03): a score and a short rationale for every Answer,
 * grouped by Category with each Category's rollup, and one overall score at the top. Every score reads
 * as stars and a band word, never a bare number (interview second pass ticket 02).
 *
 * The rationale is the point. A score on its own tells a Tenant they did badly without telling them
 * what to do about it, so every Answer shows why it was marked as it was, beside what they actually
 * said — which is also what makes an inflated or nonsensical score visible as one.
 */

export function Scorecard({ attempt, scorecard }: { attempt: Attempt; scorecard?: ScorecardData }) {
  // The rollups are derived from the Answers themselves, so a Scorecard shown on return from a
  // reload reads identically to the one shown the moment it was scored.
  const rolled = scorecard ?? rollUp(attempt.questions);
  const byCategory = new Map(rolled.categories.map((category) => [category.category, category]));
  const unanswered = attempt.questions.filter((question) => !question.answer?.transcript.trim()).length;

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
          {unanswered > 0 && `, ${unanswered} of which you didn’t get to`}. The lowest area below is the
          one worth rehearsing again.
        </p>
      </section>

      {CATEGORIES.map((category) => {
        const questions = attempt.questions.filter((question) => question.category === category);
        if (questions.length === 0) return null;
        const rollup = byCategory.get(category);
        return (
          <section key={category} aria-labelledby={`scorecard-${category}`} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border pb-1">
              <h2 id={`scorecard-${category}`} className="text-lg font-medium">
                {CATEGORY_LABEL[category]}
              </h2>
              {rollup ? (
                <ScoreStars score={rollup.score} />
              ) : (
                <span className="text-sm text-muted-foreground">Not scored</span>
              )}
            </div>
            <ul className="space-y-4">
              {questions.map((question) => (
                <li key={question.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">{question.text}</p>
                    {typeof question.answer?.score === "number" && <ScoreStars score={question.answer.score} />}
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {question.answer?.transcript.trim() || <em>You didn’t answer this one.</em>}
                  </p>
                  {question.answer?.rationale && (
                    <p className="border-l-2 border-primary/40 pl-3 text-sm">{question.answer.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
