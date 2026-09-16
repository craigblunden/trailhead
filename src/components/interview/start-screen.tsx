"use client";

import { Lock, Mic, Keyboard } from "lucide-react";

import { PlanBlaze } from "@/components/plan-mark";
import { Button } from "@/components/ui/button";
import { formatResetDay } from "@/lib/dates";
import {
  ATTEMPT_LENGTHS,
  CATEGORIES,
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_MIX,
  INPUT_MODES,
  SPEAK_RECOMMENDED,
  SPEAK_UNSUPPORTED,
  questionCount,
  type AttemptLength,
  type InputMode,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import { PLAN_LABEL, type Plan } from "@/lib/plans";
import { pluralize } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * The start screen (interview simulator tickets 05, 06, 08): the length choice, the Category
 * breakdown that length produces, how the Tenant will answer, and what this week's Attempts leave.
 *
 * Free and Basic see **this** screen, locked — the real lengths, the real breakdown — rather than a
 * separate "coming soon" page, so what `pro` unlocks is concrete rather than described. Locked, every
 * control is disabled and there is no start action to reach: the button is not merely styled as
 * unavailable, it is absent.
 */

export type StartScreenProps = {
  locked: boolean;
  plan: Plan;
  /** The lengths this Plan may choose between. Locked, they are shown as what `pro` would offer. */
  lengths: readonly AttemptLength[];
  length: AttemptLength;
  onLengthChange: (length: AttemptLength) => void;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  /** False on a browser with no speech recognition: typing is then the only mode offered. */
  speechSupported: boolean;
  quota: InterviewQuotaStatus | null;
  /** Absent when locked, so there is no way into a real Attempt from the preview. */
  onStart?: () => void;
  starting?: boolean;
  /** Why the last start didn't happen, in the page's own words. */
  failure?: string | null;
};

const MODE_LABEL: Record<InputMode, string> = { speak: "Speak my answers", type: "Type my answers" };

export function StartScreen({
  locked,
  plan,
  lengths,
  length,
  onLengthChange,
  mode,
  onModeChange,
  speechSupported,
  quota,
  onStart,
  starting = false,
  failure = null,
}: StartScreenProps) {
  const remaining = quota?.remaining ?? null;
  const outOfAttempts = remaining === 0;
  const canStart = Boolean(onStart) && !locked && !starting && !outOfAttempts;

  return (
    <div className="space-y-6">
      {locked && <LockedBanner plan={plan} />}

      <fieldset disabled={locked} className="space-y-3">
        <legend className="text-sm font-medium">How long do you have?</legend>
        <div className="flex flex-wrap gap-2">
          {ATTEMPT_LENGTHS.map((option) => {
            const allowed = lengths.includes(option);
            const selected = option === length;
            return (
              <button
                key={option}
                type="button"
                // Locked, every length is shown — that is what the preview is for — but none is a
                // real choice, and the fieldset above already refuses the click.
                disabled={locked || !allowed}
                aria-pressed={selected}
                onClick={() => onLengthChange(option)}
                className={cn(
                  "rounded-md border px-4 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                  !locked && allowed && "hover:border-primary/60 hover:text-foreground",
                  (locked || !allowed) && "opacity-60",
                )}
              >
                {option} minutes
                <span className="block text-xs font-normal">
                  {pluralize(questionCount(option), "question")}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <CategoryBreakdown length={length} />

      <fieldset disabled={locked || !speechSupported} className="space-y-2">
        <legend className="text-sm font-medium">How will you answer?</legend>
        {speechSupported ? (
          <>
            <div className="flex flex-wrap gap-2">
              {INPUT_MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={locked}
                  aria-pressed={option === mode}
                  onClick={() => onModeChange(option)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    option === mode ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                    locked && "opacity-60",
                  )}
                >
                  {option === "speak" ? <Mic aria-hidden="true" className="size-4" /> : <Keyboard aria-hidden="true" className="size-4" />}
                  {MODE_LABEL[option]}
                </button>
              ))}
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">{SPEAK_RECOMMENDED}</p>
          </>
        ) : (
          // Nothing to choose between: the fallback is offered outright, with the reason.
          <p className="max-w-prose text-sm text-muted-foreground">{SPEAK_UNSUPPORTED}</p>
        )}
      </fieldset>

      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {onStart && (
          <Button type="button" className="h-10 px-5" disabled={!canStart} onClick={onStart}>
            {starting ? "Setting up your interview…" : "Start interview"}
          </Button>
        )}
        {quota && <QuotaLine quota={quota} />}
      </div>
    </div>
  );
}

/** What is left this week, and — when nothing is — when more arrive. */
function QuotaLine({ quota }: { quota: InterviewQuotaStatus }) {
  if (quota.remaining === "unlimited") return null;
  if (quota.remaining === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You’ve used this week’s interviews. More on {formatResetDay(quota.resetsOn)}.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      {pluralize(quota.remaining, "interview")} left this week.
    </p>
  );
}

/** The five Categories and how many questions this length draws from each. */
export function CategoryBreakdown({ length }: { length: AttemptLength }) {
  const mix = CATEGORY_MIX[length];
  return (
    <div>
      <h2 className="text-sm font-medium">
        What you’ll be asked — {pluralize(questionCount(length), "question")} across all five areas
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => (
          <li key={category} className="rounded-md bg-muted/50 px-3 py-2">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{CATEGORY_LABEL[category]}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {pluralize(mix[category], "question")}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{CATEGORY_BLURB[category]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What a Tenant not on `pro` is told, above the screen they cannot use yet. */
function LockedBanner({ plan }: { plan: Plan }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-1">
        <p className="text-sm font-medium">The interview simulator is a Pro feature.</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          On Pro you rehearse against questions written from this job’s description and your own resume,
          answer them out loud against the clock, and get a scored breakdown of how you did across all
          five areas. This is the real screen — you’re on the {PLAN_LABEL[plan].toLowerCase()}, so it’s
          just not yours to start yet.
        </p>
      </div>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
        <PlanBlaze plan="pro" />
        Pro
      </span>
    </div>
  );
}
