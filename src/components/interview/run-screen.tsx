"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SpokenNotepad } from "@/components/interview/notepad";
import { Soundwave, type MicState } from "@/components/interview/soundwave";
import { primeSpeech, useAskAloud } from "@/components/interview/use-ask-aloud";
import { useSpeech } from "@/components/interview/use-speech";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MINUTES,
  CATEGORY_LABEL,
  TRANSCRIPT_MAX_CHARS,
  formatClock,
  formatMinutes,
  nextQuestion,
  secondsLeft,
  type RunQuestion,
  type TimedRun,
} from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * Answering a timed run — an Attempt or a Practice round (interview simulator tickets 02, 06; practice
 * round ticket 01; practice feedback ticket 02): one question at a time against one countdown for the whole run, with nothing on the
 * page but the question, the clock, and the Tenant's answer. It reads only what both have
 * (`TimedRun`), so it cannot tell which it is driving.
 *
 * **The clock runs from the moment a question has been asked.** The browser's voice reads it first, with
 * the clock standing still and the microphone off until the voice is done or the Tenant skips it
 * (practice round ticket 02, `use-ask-aloud.ts`); where the browser has no voice, that is at once.
 * Go puts the first question up and submitting an answer puts the next one up the same way. There is no
 * pause to choose when to begin — a real interviewer doesn't wait for the candidate to say they're
 * ready. Otherwise the clock stands still only while an answer is on its way to the server, which is the
 * network's time, not the Tenant's.
 *
 * It is still **active-time accounted**: what the server stores is the seconds each answer consumed,
 * added as the answer lands. So leaving the page stops the clock, and returning resumes on the next
 * unanswered question with exactly the time that was left. This component's countdown is display and
 * expiry; the run's real time is whatever the server has added up.
 *
 * Answers are spoken only — typing was taken away because switching between the two confused first-time
 * users (practice feedback ticket 02) — so a run is only ever put up in a browser that can transcribe.
 * They are transcribed by the browser and nothing else: no audio is recorded, uploaded, or stored (see
 * `use-speech.ts`).
 */

export type RunScreenProps = {
  run: TimedRun;
  /** What is being rehearsed, above the question trail: "Rehearsing for Product Designer at Fernwood". */
  caption: string;
  /** Whether the transcript is on show while speaking. Hidden unless the Tenant asks for it. */
  transcriptShown: boolean;
  onTranscriptShownChange: (shown: boolean) => void;
  /** Records one Answer. Resolves with null once it has landed, or a message saying why it hasn't. */
  onAnswer: (answer: { questionId: string; transcript: string; elapsedSeconds: number }) => Promise<string | null>;
  /**
   * The countdown reached zero mid-question: the run ends where it stands, with what had been said
   * on this question so far — empty when nothing had.
   */
  onTimeUp: (partial: { questionId: string; transcript: string }) => Promise<string | null>;
  /**
   * The Tenant leaves a run whose microphone failed, to fix it and come back (practice feedback ticket 05):
   * the page goes back to its Resume, where the next unanswered question waits with the time that was left.
   */
  onLeave: () => void;
  /**
   * Said beside Submit once there is something to submit — the Tutorial's pointer to it (practice
   * feedback ticket 06). Nothing on a real run.
   */
  submitCallout?: React.ReactNode;
};

export function RunScreen(props: RunScreenProps) {
  const question = nextQuestion(props.run);
  if (!question) return null;
  // A fresh run per question, keyed by it: it goes up the moment it mounts — read aloud first when
  // speaking, its clock starting once it has been asked — and nothing written or read for the last
  // question carries into this one.
  return <QuestionRun key={question.id} question={question} {...props} />;
}

type Status = "answering" | "submitting";

function QuestionRun({
  run,
  caption,
  question,
  transcriptShown,
  onTranscriptShownChange,
  onAnswer,
  onTimeUp,
  onLeave,
  submitCallout,
}: RunScreenProps & { question: RunQuestion }) {
  const questionId = useId();
  const notepadId = useId();
  const speech = useSpeech();
  const { start: listen, stop: stopListening } = speech;
  const [status, setStatus] = useState<Status>("answering");
  const [failure, setFailure] = useState<string | null>(null);

  // The question is read aloud before it is answered.
  const ask = useAskAloud(question.text);
  const answering = status === "answering" && !ask.asking;
  // Whether the question can be answered right now: asked, not on its way to the server, and with a
  // microphone that hasn't given up (practice feedback ticket 05). The clock and microphone run only then.
  const live = answering && !speech.error;

  /** When the clock last started on this question. Set as it starts, so it is never read before. */
  const startedAt = useRef(0);
  /**
   * Seconds this question had already cost when the clock last started. The clock stops for a submission
   * that fails and for a microphone that fails, and picks up from here: the server only banks an Answer's
   * time when the Answer lands, so starting from nothing would hand the Tenant those seconds back — retry
   * often enough and the countdown never moves.
   */
  const spentBefore = useRef(0);
  const [spent, setSpent] = useState(0);
  const left = Math.max(secondsLeft(run) - spent, 0);
  /** Everything this question has cost so far, to the second. */
  const spentNow = useCallback(
    () => spentBefore.current + Math.max(Math.round((Date.now() - startedAt.current) / 1_000), 0),
    [],
  );

  // The clock, running whenever the question can be answered — which, from the moment it has been asked,
  // it can. It stands still while it is read aloud, while an answer is on its way to the server, and while
  // the microphone has failed.
  useEffect(() => {
    if (!live) return;
    startedAt.current = Date.now();
    const timer = setInterval(() => setSpent(spentNow()), 250);
    return () => {
      clearInterval(timer);
      spentBefore.current = spentNow();
    };
  }, [live, spentNow]);

  // The microphone is on while the question is being answered, and off the moment it isn't — so it
  // is off while the question is read, or the recogniser would transcribe the voice. The
  // hook keeps it on through the browser ending recognition in a silence, and gives up — saying why —
  // if it can't (see `use-speech.ts`).
  useEffect(() => {
    if (!live) return;
    listen();
    return () => stopListening();
  }, [live, listen, stopListening]);

  // The answer is what the browser heard — including the phrase still settling, so the last sentence
  // before Submit isn't lost.
  const answer = [speech.transcript, speech.interim].map((part) => part.trim()).filter(Boolean).join(" ");

  // Out of time, mid-question: the run ends here. What the browser had heard is kept as this question's Answer, so half an answer is still scored; the questions after
  // it are unreached (interview second pass ticket 03).
  const expired = left === 0 && live;
  const ending = useRef(false);
  useEffect(() => {
    if (!expired || ending.current) return;
    ending.current = true;
    stopListening();
    void onTimeUp({ questionId: question.id, transcript: answer.slice(0, TRANSCRIPT_MAX_CHARS) }).then(
      (message) => message && setFailure(message),
    );
  }, [expired, onTimeUp, stopListening, question.id, answer]);

  async function submit() {
    if (!answering || !answer) return;
    // In the tap, before the wait on the server: the next question can then be read aloud on a phone.
    primeSpeech();
    // With the microphone failed, the clock already stopped, and what it had counted is the cost.
    const elapsedSeconds = live ? spentNow() : spentBefore.current;
    setStatus("submitting");
    setFailure(null);
    const message = await onAnswer({
      questionId: question.id,
      transcript: answer.slice(0, TRANSCRIPT_MAX_CHARS),
      // Everything this question has cost, including tries that failed before this one.
      elapsedSeconds,
    });
    // Landed: the parent puts the next question up, and this one unmounts with its clock.
    if (!message) return;
    // Didn't land: keep what was said, and carry on answering — the clock picks up from what it had cost.
    setFailure(message);
    setStatus("answering");
  }

  const last = run.questions.every((candidate) => candidate.id === question.id || candidate.answer);
  const submitting = status === "submitting";
  const micState: MicState = !speech.listening || submitting ? "off" : speech.hearing ? "hearing" : "listening";
  // The handover (practice feedback ticket 03): the question has been asked, the clock and microphone are
  // on, and nothing has been heard yet. Said plainly, so no one is left wondering when to start talking.
  const yourTurn = micState === "listening" && !answer && !speech.error;

  return (
    // Centred, unlike every other page's content: while the clock runs this is a stage, not a section
    // of the app, and there is no page title at the frame's edge for it to line up with.
    <div className="mx-auto max-w-3xl">
      <RunHeader run={run} caption={caption} question={question} seconds={left} />

      {/* The question is the page's heading: it is what the Tenant is here to answer, and a screen
          reader moving by headings lands on it first. */}
      <h1 id={questionId} className="mt-6 text-2xl leading-snug text-balance sm:mt-12 sm:text-3xl lg:text-4xl">
        {question.text}
      </h1>
      {/* A guide to pace against, never a cut-off: the one countdown above is still the only clock
          (interview second pass ticket 04). */}
      {/* Left out where the whole countdown is shorter than the guide — the Tutorial's one minute. */}
      {ANSWER_MINUTES[question.category] * 60 <= run.countdownSeconds && (
        <p className="mt-3 text-sm text-muted-foreground">Aim for about {formatMinutes(ANSWER_MINUTES[question.category])} min</p>
      )}

      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {ask.asking ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                Reading the question aloud. Your clock starts once it’s asked, or press Skip to start now.
              </p>
              <Button type="button" variant="outline" className="h-9 px-3" onClick={ask.skip}>
                Skip
              </Button>
            </div>
          ) : (
            <Soundwave state={micState} words={yourTurn ? "Your turn — start speaking" : undefined} />
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3"
            aria-expanded={transcriptShown}
            aria-controls={notepadId}
            onClick={() => onTranscriptShownChange(!transcriptShown)}
          >
            {transcriptShown ? "Hide transcript" : "Show transcript"}
          </Button>
        </div>
        {/* Always in the page, so the moment it fills is announced — once, not with every change of the soundwave. */}
        <p role="status" className="sr-only">
          {yourTurn ? "Your turn. Start speaking." : ""}
        </p>
        {/* Hidden by default: while speaking, the words scrolling past pull the eye away from the
            question. The Tenant can open it to check what the browser caught. */}
        {transcriptShown && <SpokenNotepad id={notepadId} settled={speech.transcript} pending={speech.interim} />}
        {/* The microphone gave up: the clock has stopped with it, what was heard stays, and the Tenant can
            try again or leave to fix it and resume (practice feedback ticket 05). */}
        {speech.error && (
          <div role="alert" className="space-y-3 rounded-md border border-destructive/40 bg-card px-3 py-3 text-sm">
            <p>
              {speech.error} Your clock has stopped{answer ? ", and what you said so far is kept" : ""}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9 px-3" onClick={listen}>
                Try again
              </Button>
              <Button type="button" variant="ghost" className="h-9 px-3" onClick={onLeave}>
                Leave and resume later
              </Button>
            </div>
          </div>
        )}
      </div>

      {failure && (
        <p role="alert" className="mt-6 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm">
          {failure}
        </p>
      )}

      {/* On a phone, Submit sticks to the bottom of the screen: the one thing to press is never below the fold. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {submitCallout && answer && !submitting && <div className="basis-full">{submitCallout}</div>}
        <Button type="button" className="h-11 px-6 text-base" disabled={submitting || ask.asking || !answer} onClick={submit}>
          {submitting ? "Saving your answer…" : last ? "Submit final answer" : "Submit answer"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {last ? "This is the last question." : "The next question starts as soon as you submit."}
        </p>
      </div>
    </div>
  );
}

/**
 * What is above every question: what is being rehearsed, how far through, and the clock. On a phone the
 * last two sit in a bar that sticks under the header, so they never scroll out of sight while an answer
 * grows (practice feedback ticket 04); from sm up, it sits in place.
 */
function RunHeader({
  run,
  caption,
  question,
  seconds,
}: {
  run: TimedRun;
  caption: string;
  question: RunQuestion;
  seconds: number;
}) {
  const position = run.questions.findIndex((candidate) => candidate.id === question.id);
  return (
    <>
      <p className="text-sm text-muted-foreground">{caption}</p>
      <div className="sticky top-[calc(3.75rem+1px)] z-20 -mx-4 mt-1 flex items-center justify-between gap-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mt-3 sm:items-start sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="min-w-0 space-y-3">
          <div className="hidden sm:block">
            <QuestionTrail questions={run.questions} current={position} />
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Question {position + 1} of {run.questions.length}
            </span>
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-foreground">
              {CATEGORY_LABEL[question.category]}
            </span>
          </p>
        </div>
        <Clock seconds={seconds} />
      </div>
    </>
  );
}

/**
 * A run on its first question with nothing yet running: the header as the run will show it — how many
 * questions, and the whole countdown standing still — with `children` where the question will be. The
 * Tutorial's steps point at it before the clock ever starts (practice feedback ticket 06).
 */
export function HeldRunScreen({ run, caption, children }: { run: TimedRun; caption: string; children: React.ReactNode }) {
  const question = nextQuestion(run);
  if (!question) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <RunHeader run={run} caption={caption} question={question} seconds={secondsLeft(run)} />
      <div className="mt-6 sm:mt-12">{children}</div>
    </div>
  );
}

/**
 * How long is left, big enough to read at a glance from the corner of the eye. It turns amber in the
 * last half-minute — a warning, not an error: running low on time is not something the Tenant did
 * wrong. A screen reader hears the two moments that matter once each, not every tick.
 */
function Clock({ seconds }: { seconds: number }) {
  const low = seconds <= 30;
  const announcement = seconds === 0 ? "" : seconds <= 10 ? "Ten seconds left." : seconds <= 60 ? "One minute left." : "";
  return (
    <div className="shrink-0 text-right">
      <p role="timer" aria-live="off" className={cn("tabular-nums", low && "text-warning")}>
        <span className="text-3xl leading-none font-semibold sm:block sm:text-5xl">{formatClock(seconds)}</span>{" "}
        <span className="text-xs text-muted-foreground sm:mt-1 sm:block">left</span>
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The questions as markers on a trail — the same connected steps the Job page uses for its Stages, so
 * "how far through" reads the way it does everywhere else. Decoration for the eye: the "Question 3 of
 * 5" beside it says the same thing in words.
 */
function QuestionTrail({ questions, current }: { questions: RunQuestion[]; current: number }) {
  return (
    <ol aria-hidden="true" className="flex flex-wrap items-center gap-1">
      {questions.map((question, index) => (
        <li key={question.id} className="flex items-center gap-1">
          {index > 0 && (
            <span className={cn("h-0.5 w-2.5 rounded sm:w-4", index <= current ? "bg-primary" : "bg-border")} />
          )}
          <span
            className={cn(
              "block rounded-full",
              index < current && "size-2.5 bg-primary",
              index === current && "size-3.5 bg-card ring-[3px] ring-primary",
              index > current && "size-2.5 bg-border",
            )}
          />
        </li>
      ))}
    </ol>
  );
}
