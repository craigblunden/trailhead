"use client";

import Link from "next/link";
import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { interviewClient, type InterviewClient } from "@/components/interview/interview-client";
import {
  JobPicker,
  Path,
  PickedJob,
  RehearsalChoices,
  SpeechUnsupported,
  Step,
  type PathJob,
} from "@/components/interview/interview-path";
import { FeedbackAsk } from "@/components/interview/feedback-ask";
import { PastInterviews } from "@/components/interview/past-interviews";
import { PracticeRounds } from "@/components/interview/practice-rounds";
import { RunScreen } from "@/components/interview/run-screen";
import { Scorecard } from "@/components/interview/scorecard";
import { useSpeechSupported } from "@/components/interview/use-speech";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { PlanBlaze } from "@/components/plan-mark";
import { Button } from "@/components/ui/button";
import { formatResetDay } from "@/lib/dates";
import {
  INTERVIEW_FAILURES,
  attemptRun,
  canStartAttempt,
  formatClock,
  isAttemptLength,
  isComplete,
  isScored,
  isUnreached,
  questionCount,
  remainingSeconds,
  type Attempt,
  type AttemptLength,
  type InterviewQuotaStatus,
  type PastAttempt,
  type Scorecard as ScorecardData,
} from "@/lib/interview";
import { pluralize } from "@/lib/jobs";
import { limitsOf, type Plan } from "@/lib/plans";
import { PRACTICE_SUMMARY, type PastPracticeRound } from "@/lib/practice";

/**
 * The Interview Simulator: one path from choosing a job to Go, the interview itself, and the
 * Scorecard (interview simulator tickets 02–08).
 *
 * `/interview` renders it with no job, so the path opens on step one; `/interview/<job>` renders it
 * with that job picked, so step one is done and the path goes on from there. The URL is the choice of
 * job — a reload, the back button, and the Job page's own link all land where the Tenant was.
 *
 * Past step one, what the path offers comes from the job's Attempt as the server handed it down,
 * never from a flag kept here: no Attempt is the set-up and Go; an unfinished one is Resume (and Start
 * over, with quota left); a finished, unscored one is scoring; a scored one is its Scorecard. While an
 * interview runs, the path gives way to the question, the clock, and the answer, and nothing else.
 */

export type InterviewPanelProps = {
  /** The chosen job, or null on `/interview` where none is chosen yet. */
  job: PathJob | null;
  plan: Plan;
  /** The Tenant's newest Attempt for the chosen job, as the server holds it. Null when there is none. */
  attempt: Attempt | null;
  quota: InterviewQuotaStatus | null;
  /** False when this deployment has no Anthropic key: the path says so instead of offering Go. */
  available: boolean;
  /**
   * The Tenant's past interviews, listed below the picker on the hub (interview second pass ticket 06).
   * Not shown with a job chosen, nor on the locked preview.
   */
  history?: PastAttempt[];
  /**
   * The Practice round on offer (practice round ticket 03): present for a Plan that may take one — whether
   * it has one unfinished decides the offer's words — and null or absent for one that may not.
   */
  practice?: { unfinished: boolean } | null;
  /** The Tenant's finished Practice rounds, listed on the hub on any Plan that has some (practice round ticket 05). */
  practiceRounds?: PastPracticeRound[];
  /** Replaced in component tests. */
  client?: InterviewClient;
};

export function InterviewPanel({
  job,
  plan,
  attempt: initial,
  quota: initialQuota,
  available,
  history = [],
  practice = null,
  practiceRounds = [],
  client = interviewClient,
}: InterviewPanelProps) {
  const locked = !canStartAttempt(plan);
  const lengths = limitsOf(locked ? "pro" : plan).interviewLengths;
  const speechSupported = useSpeechSupported();

  const [attempt, setAttempt] = useState<Attempt | null>(initial);
  const [quota, setQuota] = useState<InterviewQuotaStatus | null>(initialQuota);
  const [length, setLength] = useState<AttemptLength>(lengths[0]);
  // Chosen once and kept across questions: a Tenant who opens the transcript on the first question
  // shouldn't have to open it again on every one after.
  const [transcriptShown, setTranscriptShown] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scorecard, setScorecard] = useState<ScorecardData | undefined>(undefined);
  // Set only by the scoring that made this the Tenant's second scored Attempt, and cleared for good once
  // the ask is answered or closed — so a reload, or this Scorecard reopened, never asks.
  const [askForFeedback, setAskForFeedback] = useState(false);
  // An unfinished Attempt on arrival waits for Resume; a new one started here runs at once.
  const [running, setRunning] = useState(false);

  const unfinished = attempt !== null && !attempt.completedAt && !isComplete(attempt);
  const finished = attempt !== null && !unfinished;
  const outOfAttempts = quota?.remaining === 0;

  async function start(reset: boolean, startLength: AttemptLength) {
    if (!job) return;
    setBusy(true);
    setFailure(null);
    const answer = await client.start(job.id, startLength, reset);
    setBusy(false);
    if (answer.ok) {
      setAttempt(answer.attempt);
      setQuota(answer.quota ?? quota);
      setScorecard(undefined);
      // Go means go: the first question goes up and is asked at once, no second press.
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

  async function timeUp(partial: { questionId: string; transcript: string }) {
    // Nothing said yet: nothing to keep, and the question on screen is unreached.
    const outcome = await client.timeUp(attempt!.id, partial.transcript ? partial : undefined);
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
      setAskForFeedback(outcome.askForFeedback);
      return;
    }
    setFailure(outcome.message);
  }

  if (job && attempt && running && unfinished) {
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader leading={<BrandLogo href="/board" />} />
        <PageMain className="pt-10 sm:pt-16">
          <RunScreen
            run={attemptRun(attempt)}
            caption={`Rehearsing for ${job.role} at ${job.company}`}
            transcriptShown={transcriptShown}
            onTranscriptShownChange={setTranscriptShown}
            onAnswer={recordAnswer}
            onTimeUp={timeUp}
          />
        </PageMain>
      </div>
    );
  }

  const ready = job?.readiness === "ready";

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain>
        <div className="mx-auto max-w-2xl">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl tracking-tight">
            Interview Simulator
            {locked && (
              <span className="flex items-center gap-1.5 rounded-full border border-primary/30 px-2 py-0.5 font-sans text-xs font-medium text-primary">
                <PlanBlaze plan="pro" />
                Pro
              </span>
            )}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Three steps to a rehearsal: a job, how long, and Go. The clock starts once your first question is asked
            and doesn’t pause between them.
          </p>

          {!job && practice && <PracticeOffer unfinished={practice.unfinished} />}

          <Path>
            <Step number={1} title="Which job?" done={job !== null} open>
              {job ? <PickedJob job={job} /> : <JobPicker />}
            </Step>

            {job && unfinished ? (
              <Step number={2} title="Pick up where you left off" open last>
                <ResumeStep
                  attempt={attempt!}
                  onResume={() => setRunning(true)}
                  // An Attempt started at a retired length starts over at the shortest length offered now.
                  onStartOver={() => start(true, isAttemptLength(attempt!.length) ? attempt!.length : lengths[0])}
                  outOfAttempts={outOfAttempts}
                  speechSupported={speechSupported}
                  busy={busy}
                  failure={failure}
                />
              </Step>
            ) : job && finished && !isScored(attempt!) ? (
              <Step number={2} title={isComplete(attempt!) ? "That’s the interview" : "Time’s up"} open last>
                <ScoreStep attempt={attempt!} onScore={score} busy={busy} failure={failure} />
              </Step>
            ) : job && finished ? (
              <Step number={2} title="How it went" open last>
                <div className="space-y-6">
                  <Scorecard attempt={attempt!} scorecard={scorecard} />
                  {outOfAttempts ? (
                    <p className="text-sm text-muted-foreground">
                      You’ve used this week’s interviews. This scorecard stays here for as long as you want it.
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-5"
                      onClick={() => {
                        setAttempt(null);
                        setScorecard(undefined);
                        setAskForFeedback(false);
                        setRunning(false);
                      }}
                    >
                      Rehearse this job again
                    </Button>
                  )}
                  {askForFeedback && <FeedbackAsk onDismiss={() => setAskForFeedback(false)} />}
                </div>
              </Step>
            ) : (
              <>
                {/* Locked, the set-up opens without a job: the preview of what Pro unlocks is the point of
                    the page for these Plans, and there is no Go to reach whatever is chosen (ticket 08). */}
                <Step number={2} title="How do you want to rehearse?" done={ready && !locked} open={ready || locked}>
                  <RehearsalChoices
                    locked={locked}
                    lengths={lengths}
                    length={length}
                    onLengthChange={setLength}
                  />
                </Step>
                <Step number={3} title="Ready when you are" open={ready || locked} last>
                  <GoStep
                    locked={locked}
                    available={available}
                    length={length}
                    quota={quota}
                    speechSupported={speechSupported}
                    busy={busy}
                    failure={failure}
                    onGo={() => start(false, length)}
                  />
                </Step>
              </>
            )}
          </Path>
          {!job && !locked && <PastInterviews attempts={history} />}
          {!job && <PracticeRounds rounds={practiceRounds} />}
        </div>
      </PageMain>
    </div>
  );
}

/**
 * A Practice round, offered on the hub to a Plan that cannot start an Attempt (practice round ticket 03):
 * what one is, and a way into it — or back into the one left unfinished.
 */
function PracticeOffer({ unfinished }: { unfinished: boolean }) {
  return (
    <section
      aria-labelledby="practice-offer"
      className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-primary/30 bg-card/70 p-4"
    >
      <div className="min-w-0 basis-64">
        <h2 id="practice-offer" className="text-lg">
          Try a practice round
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Answer against the clock the way the full simulator runs. {PRACTICE_SUMMARY}.
        </p>
      </div>
      <Button asChild className="h-10 px-5">
        <Link href="/interview/practice">{unfinished ? "Resume your practice round" : "Start a practice round"}</Link>
      </Button>
    </section>
  );
}

/**
 * Go, or why there is no Go. Locked, a Pro note stands where it would be — no disabled button to
 * click into (ticket 08). In a browser that cannot transcribe, that it can't hear answers. With nothing left this week, when more arrive; without a key, that the
 * simulator isn't available here. While the questions are written, the wait, and what happens next.
 */
function GoStep({
  locked,
  available,
  length,
  quota,
  speechSupported,
  busy,
  failure,
  onGo,
}: {
  locked: boolean;
  available: boolean;
  length: AttemptLength;
  quota: InterviewQuotaStatus | null;
  /** Answers are spoken only, so a browser that cannot transcribe has no Go (practice feedback ticket 02). */
  speechSupported: boolean;
  busy: boolean;
  failure: string | null;
  onGo: () => void;
}) {
  if (locked) {
    return (
      <p className="max-w-sm rounded-md bg-primary/5 p-3 text-sm ring-1 ring-primary/20">
        The Interview Simulator is a Pro feature. This is the real set-up, so you can see what it does — it just
        isn’t yours to start yet.
      </p>
    );
  }
  if (!speechSupported) return <SpeechUnsupported className="max-w-sm" />;
  if (!available) {
    return (
      <p role="alert" className="max-w-sm rounded-md border border-destructive/40 px-3 py-2 text-sm">
        {INTERVIEW_FAILURES.unavailable}
      </p>
    );
  }
  if (busy) {
    return (
      <div className="max-w-sm space-y-2">
        <LoadingTrail>Writing your questions…</LoadingTrail>
        <p className="text-sm text-muted-foreground">
          This usually takes 10 to 25 seconds. Your first question appears straight after, with the clock running once it’s asked.
        </p>
      </div>
    );
  }

  const outOfAttempts = quota?.remaining === 0;
  return (
    <div className="max-w-sm">
      {failure && (
        <p role="alert" className="mb-3 rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="h-12 w-full text-lg font-semibold" disabled={outOfAttempts} onClick={onGo}>
        Go
      </Button>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {outOfAttempts && quota
          ? `You’ve used this week’s interviews. More on ${formatResetDay(quota.resetsOn)}.`
          : `${pluralize(questionCount(length), "question")} in ${length} minutes. The clock starts once the first is asked.`}
      </p>
      {quota && quota.remaining !== "unlimited" && !outOfAttempts && (
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {pluralize(quota.remaining, "interview")} left this week.
        </p>
      )}
    </div>
  );
}

/** An Attempt left unfinished: pick it up where it was, or spend another on a fresh one. */
function ResumeStep({
  attempt,
  onResume,
  onStartOver,
  outOfAttempts,
  speechSupported,
  busy,
  failure,
}: {
  attempt: Attempt;
  onResume: () => void;
  onStartOver: () => void;
  outOfAttempts: boolean;
  speechSupported: boolean;
  busy: boolean;
  failure: string | null;
}) {
  const answered = attempt.questions.filter((question) => question.answer).length;
  // Nothing can be answered here, so nothing can be resumed or started over.
  if (!speechSupported) {
    return (
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground">
          {answered} of {attempt.questions.length} answered, with {formatClock(remainingSeconds(attempt))} left.
        </p>
        <SpeechUnsupported />
      </div>
    );
  }
  return (
    <div className="max-w-sm space-y-3">
      <p className="text-sm text-muted-foreground">
        {answered} of {attempt.questions.length} answered, with {formatClock(remainingSeconds(attempt))} left.
        Resume puts your next question up with the clock running.
      </p>
      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="h-12 w-full text-lg font-semibold" onClick={onResume}>
        Resume
      </Button>
      {/* With nothing left this week, starting over is not offered at all: abandoning an Attempt can
          never be a way around the Limit. */}
      {outOfAttempts ? (
        <p className="text-sm text-muted-foreground">You’ve used this week’s interviews, so this is the one to finish.</p>
      ) : busy ? (
        <LoadingTrail>Writing your questions…</LoadingTrail>
      ) : (
        <Button type="button" variant="ghost" className="h-auto w-full py-2 whitespace-normal" onClick={onStartOver}>
          Start over, using another of this week’s interviews
        </Button>
      )}
    </div>
  );
}

/**
 * Every question answered, or the clock ran out: what is left is the Scorecard. When the clock ran out
 * first, that is said before scoring rather than discovered in it — questions that were never shown
 * otherwise look like questions the app lost.
 */
function ScoreStep({
  attempt,
  onScore,
  busy,
  failure,
}: {
  attempt: Attempt;
  onScore: () => void;
  busy: boolean;
  failure: string | null;
}) {
  const total = attempt.questions.length;
  const unreached = attempt.questions.filter(isUnreached).length;
  return (
    <div className="max-w-md space-y-3">
      {unreached > 0 && (
        <div className="rounded-md bg-warning/10 px-3 py-2 text-sm ring-1 ring-warning/40">
          <p className="font-medium">
            You reached {total - unreached} of {total} questions before the clock ran out.
          </p>
          <p className="mt-1 text-muted-foreground">
            The {pluralize(unreached, "question")} you didn’t reach will show as Not reached. They count for less than
            an answer would, but still pull your overall score down. The clock is shared by every question, so keep
            to the time shown under each one next time.
          </p>
        </div>
      )}
      <p className="text-muted-foreground">
        Scoring reads every answer you gave and marks it against what this role asks for. It takes a few seconds,
        and it doesn’t use another of this week’s interviews.
      </p>
      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <Button type="button" className="h-11 px-6 text-base" disabled={busy} onClick={onScore}>
        {busy ? "Scoring your answers…" : "Score my interview"}
      </Button>
    </div>
  );
}
