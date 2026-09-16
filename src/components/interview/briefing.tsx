"use client";

import { ClipboardCheck, Keyboard, Lock, Mic, Timer } from "lucide-react";

import { LoadingTrail } from "@/components/loading-trail";
import { Button } from "@/components/ui/button";
import { formatResetDay } from "@/lib/dates";
import {
  ATTEMPT_LENGTHS,
  CATEGORIES,
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_MIX,
  SPEAK_RECOMMENDED,
  SPEAK_UNSUPPORTED,
  questionCount,
  type AttemptLength,
  type InputMode,
  type InterviewQuotaStatus,
} from "@/lib/interview";
import { pluralize } from "@/lib/jobs";
import { PLAN_LABEL, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * What a Tenant reads before an interview starts (interview simulator tickets 05, 06, 08): how it runs,
 * what they'll be asked, and — beside it, where the Documents page keeps its upload card — the choices
 * that set it up and the Go that starts the clock.
 *
 * The main column is written to be read once. It says the thing most worth knowing before pressing Go:
 * **the clock doesn't pause between questions**, so the Tenant isn't caught out by the second question
 * arriving the moment they submit the first.
 */
export function Briefing({
  length,
  speechSupported,
  children,
}: {
  length: AttemptLength;
  speechSupported: boolean;
  /** The card beside the briefing: setting up a new interview, or resuming one. */
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* The card first in reading order, so on a phone the choices and Go come before the reading;
          on wide screens it stands beside the briefing and stays in view while it's read. */}
      <div className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">{children}</div>

      <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-xl">
            How it works
          </h2>
          <ul className="mt-4 max-w-prose space-y-4">
            <Point icon={<Timer aria-hidden="true" className="size-5" />}>
              <strong className="font-semibold">One clock for the whole interview, and it doesn’t pause.</strong>{" "}
              It starts when you press Go, with your first question on screen. Submit an answer and the next
              question starts straight away — move quickly through the ones you find easy to save time for
              the ones you don’t.
            </Point>
            <Point icon={<Mic aria-hidden="true" className="size-5" />}>
              {speechSupported ? SPEAK_RECOMMENDED : SPEAK_UNSUPPORTED}
            </Point>
            <Point icon={<ClipboardCheck aria-hidden="true" className="size-5" />}>
              When you’ve answered every question, each answer is marked out of 100 with a line on why, and
              rolled up by area. If you have to leave part-way, the clock stops and you pick up where you
              left off.
            </Point>
          </ul>
        </section>

        <CategoryBreakdown length={length} />
      </div>
    </div>
  );
}

function Point({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        {icon}
      </span>
      <p className="text-[0.9375rem] leading-relaxed">{children}</p>
    </li>
  );
}

/** The five Categories and how many questions the chosen length draws from each. */
export function CategoryBreakdown({ length }: { length: AttemptLength }) {
  const mix = CATEGORY_MIX[length];
  return (
    <section aria-labelledby="asked-heading">
      <h2 id="asked-heading" className="text-xl">
        What you’ll be asked
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {pluralize(questionCount(length), "question")} across all five areas, drawn from this job’s posting
        and your resume.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <li key={category} className="rounded-lg bg-card/80 px-3.5 py-3 ring-1 ring-foreground/10">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{CATEGORY_LABEL[category]}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {pluralize(mix[category], "question")}
              </span>
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{CATEGORY_BLURB[category]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type SetupCardProps = {
  locked: boolean;
  plan: Plan;
  /** The lengths this Plan may choose between. Locked, they are shown as what `pro` would offer. */
  lengths: readonly AttemptLength[];
  length: AttemptLength;
  onLengthChange: (length: AttemptLength) => void;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  speechSupported: boolean;
  quota: InterviewQuotaStatus | null;
  /** Absent when locked or unavailable, so there is no way into a real Attempt from the card. */
  onGo?: () => void;
  /** The questions are being written: Go has been pressed and the clock is about to start. */
  preparing?: boolean;
  failure?: string | null;
};

/**
 * The choices that set an interview up, and Go.
 *
 * Free and Basic see **this** card, locked — the real lengths and the real ways to answer — rather than
 * a separate "coming soon" page, so what `pro` unlocks is concrete. Locked, every choice is disabled
 * and Go is not there at all: not styled as unavailable, absent.
 */
export function SetupCard({
  locked,
  plan,
  lengths,
  length,
  onLengthChange,
  mode,
  onModeChange,
  speechSupported,
  quota,
  onGo,
  preparing = false,
  failure = null,
}: SetupCardProps) {
  const outOfAttempts = quota?.remaining === 0;

  return (
    <section aria-labelledby="setup-heading" className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-foreground/10">
      <h2 id="setup-heading" className="text-xl">
        Your interview
      </h2>

      {locked && <LockedNote plan={plan} />}

      {preparing ? (
        <div className="mt-5 space-y-3">
          <LoadingTrail>Writing your questions…</LoadingTrail>
          <p className="text-sm text-muted-foreground">
            This usually takes 10 to 25 seconds. Your first question appears here, and the clock starts with it.
          </p>
        </div>
      ) : (
        <>
          <fieldset disabled={locked} className="mt-5">
            <legend className="text-sm font-medium">How long do you have?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ATTEMPT_LENGTHS.map((option) => {
                const allowed = lengths.includes(option);
                return (
                  <Choice
                    key={option}
                    selected={option === length}
                    disabled={locked || !allowed}
                    onClick={() => onLengthChange(option)}
                  >
                    <span className="block text-lg leading-tight font-semibold tabular-nums">{option}</span>
                    <span className="block text-xs">minutes</span>
                  </Choice>
                );
              })}
            </div>
          </fieldset>

          {speechSupported && (
            <fieldset disabled={locked} className="mt-5">
              <legend className="text-sm font-medium">How will you answer?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Choice selected={mode === "speak"} disabled={locked} onClick={() => onModeChange("speak")}>
                  <span className="flex items-center justify-center gap-1.5">
                    <Mic aria-hidden="true" className="size-4" />
                    Speaking
                  </span>
                </Choice>
                <Choice selected={mode === "type"} disabled={locked} onClick={() => onModeChange("type")}>
                  <span className="flex items-center justify-center gap-1.5">
                    <Keyboard aria-hidden="true" className="size-4" />
                    Typing
                  </span>
                </Choice>
              </div>
            </fieldset>
          )}

          {failure && (
            <p role="alert" className="mt-5 rounded-md border border-destructive/40 px-3 py-2 text-sm">
              {failure}
            </p>
          )}

          {onGo && (
            <div className="mt-6">
              <Button
                type="button"
                className="h-12 w-full text-lg font-semibold"
                disabled={outOfAttempts}
                onClick={onGo}
              >
                Go
              </Button>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {pluralize(questionCount(length), "question")} in {length} minutes. The clock starts with the first.
              </p>
            </div>
          )}

          {/* Never shown locked: this effort ships the preview for free and basic, not their real
              entitlements, and a count under "this is a Pro feature" would promise one they can't spend. */}
          {quota && !locked && <QuotaLine quota={quota} />}
        </>
      )}
    </section>
  );
}

function Choice({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-2 text-center text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
        !disabled && !selected && "hover:border-primary/50 hover:text-foreground",
        disabled && "opacity-55",
      )}
    >
      {children}
    </button>
  );
}

function QuotaLine({ quota }: { quota: InterviewQuotaStatus }) {
  if (quota.remaining === "unlimited") return null;
  return (
    <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
      {quota.remaining === 0
        ? `You’ve used this week’s interviews. More on ${formatResetDay(quota.resetsOn)}.`
        : `${pluralize(quota.remaining, "interview")} left this week.`}
    </p>
  );
}

/** What a Tenant not on `pro` is told, above the card they can't use yet. */
function LockedNote({ plan }: { plan: Plan }) {
  return (
    <div className="mt-4 flex gap-3 rounded-md bg-primary/5 p-3 ring-1 ring-primary/20">
      <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">The Interview Simulator is a Pro feature.</p>
        <p className="text-muted-foreground">
          This is the real set-up — you’re on the {PLAN_LABEL[plan].toLowerCase()}, so it isn’t yours to start
          yet.
        </p>
      </div>
    </div>
  );
}
