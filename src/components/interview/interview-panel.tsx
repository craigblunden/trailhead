"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { AttemptRun } from "@/components/interview/attempt-run";
import { interviewClient, type InterviewClient } from "@/components/interview/interview-client";
import { Scorecard } from "@/components/interview/scorecard";
import { StartScreen } from "@/components/interview/start-screen";
import { useSpeechSupported } from "@/components/interview/use-speech";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  INTERVIEW_FAILURES,
  canStartAttempt,
  isComplete,
  isScored,
  type Attempt,
  type AttemptLength,
  type InputMode,
  type InterviewQuotaStatus,
  type Scorecard as ScorecardData,
} from "@/lib/interview";
import type { Job } from "@/lib/jobs";
import { limitsOf, type Plan } from "@/lib/plans";

/**
 * One Job's Interview Simulator page: the start screen, the Attempt in flight, and the Scorecard,
 * in the one place that knows which of them the Tenant is looking at.
 *
 * Which it is comes from the Attempt the server handed down, never from a flag this component keeps:
 * no Attempt is the start screen, an unfinished one offers Resume (and Reset, if there is quota for
 * it), a finished and unscored one offers scoring, and a scored one is the Scorecard. So a reload
 * mid-rehearsal lands exactly where the Tenant was — which is the whole of ticket 04 on this side.
 */

type Phase = "start" | "running" | "scored";

export type InterviewPanelProps = {
  job: Pick<Job, "id" | "company" | "role">;
  plan: Plan;
  /** The Tenant's newest Attempt for this Job, as the server holds it. Null when they have none. */
  attempt: Attempt | null;
  quota: InterviewQuotaStatus | null;
  /** False when this deployment has no Anthropic key: the page says so instead of offering a start. */
  available: boolean;
  /** Replaced in component tests. */
  client?: InterviewClient;
};

export function InterviewPanel({
  job,
  plan,
  attempt: initial,
  quota: initialQuota,
  available,
  client = interviewClient,
}: InterviewPanelProps) {
  const locked = !canStartAttempt(plan);
  const lengths = limitsOf(locked ? "pro" : plan).interviewLengths;
  const speechSupported = useSpeechSupported();

  const [attempt, setAttempt] = useState<Attempt | null>(initial);
  const [quota, setQuota] = useState<InterviewQuotaStatus | null>(initialQuota);
  const [length, setLength] = useState<AttemptLength>(lengths[0]);
  const [mode, setMode] = useState<InputMode>("speak");
  const [failure, setFailure] = useState<string | null>(available ? null : INTERVIEW_FAILURES.unavailable);
  const [busy, setBusy] = useState(false);
  const [scorecard, setScorecard] = useState<ScorecardData | undefined>(undefined);
  // Resuming is what an unfinished Attempt does on arrival; the Tenant chooses when to pick it up.
  const [resumed, setResumed] = useState(false);

  const unfinished = attempt !== null && !attempt.completedAt && !isComplete(attempt);
  const finished = attempt !== null && (attempt.completedAt !== null || isComplete(attempt));
  const phase: Phase = isScored(attempt ?? { overallScore: null })
    ? "scored"
    : unfinished && resumed
      ? "running"
      : "start";
  // Speaking is the default wherever the browser can transcribe; typing is offered where it cannot.
  const effectiveMode: InputMode = speechSupported ? mode : "type";

  async function start(reset: boolean) {
    setBusy(true);
    setFailure(null);
    const answer = await client.start(job.id, length, reset);
    setBusy(false);
    if (answer.ok) {
      setAttempt(answer.attempt);
      setQuota(answer.quota ?? quota);
      setScorecard(undefined);
      setResumed(true);
      return;
    }
    if (answer.quota) setQuota(answer.quota);
    // An Attempt already in progress is not a failure to report: it is the thing to resume.
    if (answer.error === "in-progress" && "attempt" in answer && answer.attempt) {
      setAttempt(answer.attempt as Attempt);
      return;
    }
    setFailure(answer.message);
  }

  async function recordAnswer(answer: { questionId: string; transcript: string; elapsedSeconds: number }) {
    const outcome = await client.answer(attempt!.id, answer);
    if (outcome.ok) {
      setAttempt(outcome.attempt);
      return null;
    }
    return outcome.message;
  }

  async function timeUp() {
    const outcome = await client.timeUp(attempt!.id);
    if (outcome.ok) {
      setAttempt(outcome.attempt);
      return null;
    }
    return outcome.message;
  }

  async function score() {
    setBusy(true);
    setFailure(null);
    const outcome = await client.score(attempt!.id);
    setBusy(false);
    if (outcome.ok) {
      setAttempt(outcome.attempt);
      setScorecard(outcome.scorecard);
      return;
    }
    setFailure(outcome.message);
  }

  const outOfAttempts = quota?.remaining === 0;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <Button asChild variant="ghost" className="-ml-2 h-8 px-2 text-sm">
          <Link href="/interview">
            <ArrowLeft aria-hidden="true" className="size-4" />
            All jobs
          </Link>
        </Button>

        <h1 className="mt-2 text-3xl tracking-tight">Interview practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {job.role} at {job.company}
        </p>

        <div className="mt-6 max-w-4xl">
          {phase === "scored" && attempt && (
            <div className="space-y-6">
              <Scorecard attempt={attempt} scorecard={scorecard} />
              <StartAgain
                onStart={() => {
                  setAttempt(null);
                  setScorecard(undefined);
                  setResumed(false);
                }}
                outOfAttempts={outOfAttempts}
              />
            </div>
          )}

          {phase === "running" && attempt && (
            <AttemptRun
              attempt={attempt}
              mode={effectiveMode}
              onModeChange={setMode}
              speechSupported={speechSupported}
              onAnswer={recordAnswer}
              onTimeUp={timeUp}
            />
          )}

          {phase === "start" && (
            <div className="space-y-6">
              {unfinished && (
                <ResumeOrReset
                  onResume={() => setResumed(true)}
                  onReset={() => start(true)}
                  outOfAttempts={outOfAttempts}
                  busy={busy}
                />
              )}
              {finished && !isScored(attempt) && (
                <ScoreIt onScore={score} busy={busy} failure={failure} />
              )}
              {!unfinished && !finished && (
                <StartScreen
                  locked={locked}
                  plan={plan}
                  lengths={lengths}
                  length={length}
                  onLengthChange={setLength}
                  mode={effectiveMode}
                  onModeChange={setMode}
                  speechSupported={speechSupported}
                  quota={quota}
                  // No start action at all when locked: the preview cannot be clicked into a real Attempt.
                  onStart={locked || !available ? undefined : () => start(false)}
                  starting={busy}
                  failure={failure}
                />
              )}
            </div>
          )}
        </div>
      </PageMain>
    </div>
  );
}

/** An Attempt left unfinished: pick it up where it was, or spend another on a fresh one. */
function ResumeOrReset({
  onResume,
  onReset,
  outOfAttempts,
  busy,
}: {
  onResume: () => void;
  onReset: () => void;
  outOfAttempts: boolean;
  busy: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15">
      <h2 className="text-lg font-medium">You have an interview in progress</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Pick up where you left off — the same questions, and the time you had left when you stopped.
        {outOfAttempts
          ? " You’ve used this week’s interviews, so this is the one to finish."
          : " Or start again from scratch, which uses another of this week’s interviews."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10 px-5" onClick={onResume}>
          Resume
        </Button>
        {/* With nothing left this week, resetting is not offered at all: abandoning an Attempt can
            never be a way around the Limit. */}
        {!outOfAttempts && (
          <Button type="button" variant="outline" className="h-10 px-5" disabled={busy} onClick={onReset}>
            {busy ? "Starting a new one…" : "Start over"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Every question answered, or the clock ran out: what is left is the Scorecard. */
function ScoreIt({ onScore, busy, failure }: { onScore: () => void; busy: boolean; failure: string | null }) {
  return (
    <div className="space-y-3 rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15">
      <h2 className="text-lg font-medium">That’s the interview</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Scoring reads every answer you gave and marks it against what this role asks for. It takes a
        few seconds, and it doesn’t use another of this week’s interviews.
      </p>
      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="h-10 px-5" disabled={busy} onClick={onScore}>
        {busy ? "Scoring your answers…" : "Score my interview"}
      </Button>
    </div>
  );
}

function StartAgain({ onStart, outOfAttempts }: { onStart: () => void; outOfAttempts: boolean }) {
  if (outOfAttempts) {
    return (
      <p className="text-sm text-muted-foreground">
        You’ve used this week’s interviews. This scorecard stays here for as long as you want it.
      </p>
    );
  }
  return (
    <Button type="button" variant="outline" className="h-10 px-5" onClick={onStart}>
      Rehearse this job again
    </Button>
  );
}
