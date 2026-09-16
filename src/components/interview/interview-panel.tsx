"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { AttemptRun } from "@/components/interview/attempt-run";
import { Briefing, SetupCard } from "@/components/interview/briefing";
import { interviewClient, type InterviewClient } from "@/components/interview/interview-client";
import { Scorecard } from "@/components/interview/scorecard";
import { useSpeechSupported } from "@/components/interview/use-speech";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  INTERVIEW_FAILURES,
  canStartAttempt,
  formatClock,
  isComplete,
  isScored,
  remainingSeconds,
  type Attempt,
  type AttemptLength,
  type InputMode,
  type InterviewQuotaStatus,
  type Scorecard as ScorecardData,
} from "@/lib/interview";
import type { Job } from "@/lib/jobs";
import { limitsOf, type Plan } from "@/lib/plans";

/**
 * One Job's Interview Simulator page: the briefing, the interview itself, and the Scorecard, in the
 * one place that knows which of them the Tenant is looking at.
 *
 * Which it is comes from the Attempt the server handed down, never from a flag this component keeps:
 * no Attempt is the briefing, an unfinished one offers Resume (and Start over, if there is quota for
 * it), a finished and unscored one offers scoring, and a scored one is the Scorecard. So a reload
 * mid-rehearsal lands exactly where the Tenant was — which is the whole of ticket 04 on this side.
 *
 * While the interview runs, the page drops everything but the question, the clock, and the answer:
 * no briefing, no back link, no side card. That focus is the point of the page.
 */

type Phase = "briefing" | "running" | "scored";

export type InterviewPanelProps = {
  job: Pick<Job, "id" | "company" | "role">;
  plan: Plan;
  /** The Tenant's newest Attempt for this Job, as the server holds it. Null when they have none. */
  attempt: Attempt | null;
  quota: InterviewQuotaStatus | null;
  /** False when this deployment has no Anthropic key: the page says so instead of offering Go. */
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
  // Chosen once and kept across questions: a Tenant who opens the transcript on the first question
  // shouldn't have to open it again on every one after.
  const [transcriptShown, setTranscriptShown] = useState(false);
  const [failure, setFailure] = useState<string | null>(available ? null : INTERVIEW_FAILURES.unavailable);
  const [busy, setBusy] = useState(false);
  const [scorecard, setScorecard] = useState<ScorecardData | undefined>(undefined);
  // An unfinished Attempt on arrival waits for Resume; a new one started here runs at once.
  const [running, setRunning] = useState(false);

  const unfinished = attempt !== null && !attempt.completedAt && !isComplete(attempt);
  const finished = attempt !== null && (attempt.completedAt !== null || isComplete(attempt));
  const phase: Phase = attempt && isScored(attempt) ? "scored" : unfinished && running ? "running" : "briefing";
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
      // Go means go: the first question goes up with its clock running, no second press.
      setRunning(true);
      return;
    }
    if (answer.quota) setQuota(answer.quota);
    // An Attempt already in progress is not a failure to report: it is the thing to resume.
    if (answer.error === "in-progress" && answer.attempt) {
      setAttempt(answer.attempt);
      return;
    }
    setFailure(answer.message);
  }

  async function recordAnswer(answer: { questionId: string; transcript: string; elapsedSeconds: number }) {
    const outcome = await client.answer(attempt!.id, answer);
    if (!outcome.ok) return outcome.message;
    setAttempt(outcome.attempt);
    return null;
  }

  async function timeUp() {
    const outcome = await client.timeUp(attempt!.id);
    if (!outcome.ok) return outcome.message;
    setAttempt(outcome.attempt);
    return null;
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

  if (phase === "running" && attempt) {
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader leading={<BrandLogo href="/board" />} />
        <PageMain className="pt-10 sm:pt-16">
          <AttemptRun
            attempt={attempt}
            job={job}
            mode={effectiveMode}
            onModeChange={setMode}
            speechSupported={speechSupported}
            transcriptShown={transcriptShown}
            onTranscriptShownChange={setTranscriptShown}
            onAnswer={recordAnswer}
            onTimeUp={timeUp}
          />
        </PageMain>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <Button asChild variant="ghost" className="-ml-2 h-8 px-2 text-sm">
          <Link href="/interview">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Interview Simulator
          </Link>
        </Button>

        <h1 className="mt-2 text-3xl tracking-tight text-balance sm:text-4xl">{job.role}</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          {phase === "scored"
            ? `How your rehearsal for ${job.company} went.`
            : `Rehearse for your interview at ${job.company}, with questions drawn from this job’s posting and your resume.`}
        </p>

        <div className="mt-8">
          {phase === "scored" && attempt && (
            <div className="max-w-4xl space-y-6">
              <Scorecard attempt={attempt} scorecard={scorecard} />
              <RehearseAgain
                onStart={() => {
                  setAttempt(null);
                  setScorecard(undefined);
                  setRunning(false);
                }}
                outOfAttempts={outOfAttempts}
              />
            </div>
          )}

          {phase === "briefing" && finished && !isScored(attempt!) && (
            <ScoreIt onScore={score} busy={busy} failure={failure} />
          )}

          {phase === "briefing" && !finished && (
            <Briefing length={unfinished ? attempt!.length : length} speechSupported={speechSupported}>
              {unfinished ? (
                <ResumeCard
                  attempt={attempt!}
                  onResume={() => setRunning(true)}
                  onStartOver={() => start(true)}
                  outOfAttempts={outOfAttempts}
                  busy={busy}
                  failure={failure}
                />
              ) : (
                <SetupCard
                  locked={locked}
                  plan={plan}
                  lengths={lengths}
                  length={length}
                  onLengthChange={setLength}
                  mode={effectiveMode}
                  onModeChange={setMode}
                  speechSupported={speechSupported}
                  quota={quota}
                  // No Go at all when locked: the preview cannot be clicked into a real Attempt.
                  onGo={locked || !available ? undefined : () => start(false)}
                  preparing={busy}
                  failure={failure}
                />
              )}
            </Briefing>
          )}
        </div>
      </PageMain>
    </div>
  );
}

/** An Attempt left unfinished: pick it up where it was, or spend another on a fresh one. */
function ResumeCard({
  attempt,
  onResume,
  onStartOver,
  outOfAttempts,
  busy,
  failure,
}: {
  attempt: Attempt;
  onResume: () => void;
  onStartOver: () => void;
  outOfAttempts: boolean;
  busy: boolean;
  failure: string | null;
}) {
  const answered = attempt.questions.filter((question) => question.answer).length;
  return (
    <section aria-labelledby="resume-heading" className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-foreground/10">
      <h2 id="resume-heading" className="text-xl">
        You have an interview in progress
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {answered} of {attempt.questions.length} answered, with {formatClock(remainingSeconds(attempt))} left.
        Resume puts your next question up with the clock running.
      </p>
      {failure && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="mt-5 h-12 w-full text-lg font-semibold" onClick={onResume}>
        Resume
      </Button>
      {/* With nothing left this week, starting over is not offered at all: abandoning an Attempt can
          never be a way around the Limit. */}
      {outOfAttempts ? (
        <p className="mt-3 text-sm text-muted-foreground">
          You’ve used this week’s interviews, so this is the one to finish.
        </p>
      ) : (
        <Button type="button" variant="ghost" className="mt-2 h-auto w-full py-2 whitespace-normal" disabled={busy} onClick={onStartOver}>
          {busy ? "Starting a new one…" : "Start over, using another of this week’s interviews"}
        </Button>
      )}
    </section>
  );
}

/** Every question answered, or the clock ran out: what is left is the Scorecard. */
function ScoreIt({ onScore, busy, failure }: { onScore: () => void; busy: boolean; failure: string | null }) {
  return (
    <section
      aria-labelledby="done-heading"
      className="max-w-xl space-y-3 rounded-lg bg-card p-6 shadow-sm ring-1 ring-foreground/10"
    >
      <h2 id="done-heading" className="text-2xl">
        That’s the interview
      </h2>
      <p className="text-muted-foreground">
        Scoring reads every answer you gave and marks it against what this role asks for. It takes a few
        seconds, and it doesn’t use another of this week’s interviews.
      </p>
      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="h-11 px-6 text-base" disabled={busy} onClick={onScore}>
        {busy ? "Scoring your answers…" : "Score my interview"}
      </Button>
    </section>
  );
}

function RehearseAgain({ onStart, outOfAttempts }: { onStart: () => void; outOfAttempts: boolean }) {
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
