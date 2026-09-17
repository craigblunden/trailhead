"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { SpeechUnsupported, SpokenAnswers } from "@/components/interview/interview-path";
import { practiceClient, type PracticeClient } from "@/components/interview/practice-client";
import { PracticeAnswers, ScoringOnPro } from "@/components/interview/practice-read-back";
import { RunScreen } from "@/components/interview/run-screen";
import { primeSpeech } from "@/components/interview/use-ask-aloud";
import { useSpeechSupported } from "@/components/interview/use-speech";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { formatClock, isComplete, secondsLeft, type RecordAnswerRequest } from "@/lib/interview";
import { PRACTICE_QUESTION_COUNT, PRACTICE_SECONDS, PRACTICE_SUMMARY, type PracticeRound } from "@/lib/practice";

/**
 * A Practice round, from set-up to its end (practice round tickets 03, 04): how to answer and Go, the
 * round itself on the Attempt's own run screen, and what was said once it is over.
 *
 * What the page offers comes from the round the server handed down, never from a flag kept here: no
 * round is the set-up and Go; an unfinished one is Resume or Start over; a finished one is its end. While
 * a round runs, the page gives way to the question, the clock, and the answer, and nothing else.
 */

export type PracticePanelProps = {
  /** The Tenant's unfinished round, as the server holds it, or null for a fresh set-up. */
  round: PracticeRound | null;
  /** Replaced in component tests. */
  client?: PracticeClient;
};

export function PracticePanel({ round: initial, client = practiceClient }: PracticePanelProps) {
  const speechSupported = useSpeechSupported();
  const [round, setRound] = useState<PracticeRound | null>(initial);
  const [transcriptShown, setTranscriptShown] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An unfinished round on arrival waits for Resume; one started here runs at once.
  const [running, setRunning] = useState(false);

  const unfinished = round !== null && !round.completedAt && !isComplete(round);

  async function start(reset: boolean) {
    // In the tap, before the wait on the server: the first question can then be read aloud on a phone.
    primeSpeech();
    setBusy(true);
    setFailure(null);
    const answer = await client.start(reset);
    setBusy(false);
    if (answer.ok) {
      setRound(answer.round);
      setRunning(true);
      return;
    }
    // A round already in progress is not a failure to report: it is the thing to resume.
    if (answer.error === "in-progress" && answer.round) {
      setRound(answer.round);
      return;
    }
    setFailure(answer.message);
  }

  async function recordAnswer(answer: RecordAnswerRequest) {
    const outcome = await client.answer(round!.id, answer);
    if (!outcome.ok) return outcome.message;
    setRound(outcome.round);
    return null;
  }

  async function timeUp(partial: { questionId: string; transcript: string }) {
    const outcome = await client.timeUp(round!.id, partial.transcript ? partial : undefined);
    if (!outcome.ok) return outcome.message;
    setRound(outcome.round);
    return null;
  }

  function practiseAgain() {
    setRound(null);
    setRunning(false);
    void start(false);
  }

  if (round && running && unfinished) {
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader leading={<BrandLogo href="/board" />} />
        <PageMain className="pt-4 sm:pt-16">
          <RunScreen
            run={round}
            caption="Practice round"
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
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/interview">
              <ArrowLeft aria-hidden="true" />
              Interview Simulator
            </Link>
          </Button>
          <h1 className="text-3xl tracking-tight">Practice round</h1>
          <p className="mt-1 text-muted-foreground">
            Two questions about you and two about how you’ve handled work, answered against the clock the way the
            Interview Simulator runs. {PRACTICE_SUMMARY}.
          </p>

          <div className={round && !unfinished ? "mt-8 space-y-5" : "mt-8 max-w-sm space-y-5"}>
            {round && unfinished ? (
              <ResumeRound
                round={round}
                speechSupported={speechSupported}
                busy={busy}
                onResume={() => {
                  primeSpeech();
                  setRunning(true);
                }}
                onStartOver={() => start(true)}
              />
            ) : round ? (
              <RoundEnd round={round} busy={busy} onPractiseAgain={practiseAgain} />
            ) : (
              <>
                <SpokenAnswers />
                {!speechSupported ? (
                  <SpeechUnsupported />
                ) : busy ? (
                  <LoadingTrail>Setting up your round…</LoadingTrail>
                ) : (
                  <div>
                    <Button type="button" className="h-12 w-full text-lg font-semibold" onClick={() => start(false)}>
                      Go
                    </Button>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                      {PRACTICE_QUESTION_COUNT} questions in {PRACTICE_SECONDS / 60} minutes. The clock starts once the
                      first is asked.
                    </p>
                  </div>
                )}
              </>
            )}
            {failure && (
              <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
                {failure}
              </p>
            )}
          </div>
        </div>
      </PageMain>
    </div>
  );
}

/** A round left unfinished: pick it up where it was, or throw it away for a fresh one — it cost nothing. */
function ResumeRound({
  round,
  speechSupported,
  busy,
  onResume,
  onStartOver,
}: {
  round: PracticeRound;
  /** Answers are spoken only, so a browser that cannot transcribe can't resume (practice feedback ticket 02). */
  speechSupported: boolean;
  busy: boolean;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const answered = round.questions.filter((question) => question.answer).length;
  return (
    <div className="space-y-3">
      <h2 className="text-xl">Pick up where you left off</h2>
      <p className="text-sm text-muted-foreground">
        {answered} of {round.questions.length} answered, with {formatClock(secondsLeft(round))} left.
        {speechSupported && " Resume puts your next question up."}
      </p>
      {!speechSupported ? (
        <SpeechUnsupported />
      ) : (
        <>
          <Button type="button" className="h-12 w-full text-lg font-semibold" onClick={onResume}>
            Resume
          </Button>
          {busy ? (
            <LoadingTrail>Setting up your round…</LoadingTrail>
          ) : (
            <Button type="button" variant="ghost" className="h-auto w-full py-2" onClick={onStartOver}>
              Start over
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Every question answered, or the clock ran out (practice round ticket 04): what was said, read back, with
 * scoring shown as the Pro feature it is where a Scorecard would be — and another round, straight away.
 */
function RoundEnd({ round, busy, onPractiseAgain }: { round: PracticeRound; busy: boolean; onPractiseAgain: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        {/* The clock running out mid-answer on the last question keeps that answer too, so every question can
          have one and it was still time that ended the round: time left is what tells the two apart. */}
      <h2 className="text-xl">{isComplete(round) && secondsLeft(round) > 0 ? "That’s the practice round" : "Time’s up"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here’s what you said. Your answers are saved, and you can read them again from the Interview Simulator.
        </p>
      </div>
      <ScoringOnPro />
      <PracticeAnswers round={round} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" className="h-11 px-6 text-base" disabled={busy} onClick={onPractiseAgain}>
          Practise again
        </Button>
        <p className="text-sm text-muted-foreground">
          The full Interview Simulator on Pro asks about a real job, from its posting and your resume.
        </p>
      </div>
    </div>
  );
}
