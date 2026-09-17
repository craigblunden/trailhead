"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Keyboard, Mic } from "lucide-react";

import { SpokenNotepad, TypedNotepad } from "@/components/interview/notepad";
import { Soundwave, type MicState } from "@/components/interview/soundwave";
import { useAskAloud } from "@/components/interview/use-ask-aloud";
import { useSpeech } from "@/components/interview/use-speech";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MINUTES,
  CATEGORY_LABEL,
  SPEAK_UNSUPPORTED,
  TRANSCRIPT_MAX_CHARS,
  formatClock,
  formatMinutes,
  nextQuestion,
  secondsLeft,
  type InputMode,
  type RunQuestion,
  type TimedRun,
} from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * Answering a timed run — an Attempt or a Practice round (interview simulator tickets 02, 06; practice
 * round ticket 01): one question at a time against one countdown for the whole run, with nothing on the
 * page but the question, the clock, and the Tenant's answer. It reads only what both have
 * (`TimedRun`), so it cannot tell which it is driving.
 *
 * **The clock runs from the moment a question has been asked.** Typed, that is the moment it is on
 * screen; spoken, the browser's voice reads it first, with the clock standing still and the microphone
 * off until the voice is done or the Tenant skips it (practice round ticket 02, `use-ask-aloud.ts`).
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
 * Spoken answers are transcribed by the browser and nothing else: no audio is recorded, uploaded, or
 * stored (see `use-speech.ts`). Both modes write the same transcript, so scoring cannot tell which was
 * used.
 */

export type RunScreenProps = {
  run: TimedRun;
  /** What is being rehearsed, above the question trail: "Rehearsing for Product Designer at Fernwood". */
  caption: string;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  speechSupported: boolean;
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
  mode,
  onModeChange,
  speechSupported,
  transcriptShown,
  onTranscriptShownChange,
  onAnswer,
  onTimeUp,
}: RunScreenProps & { question: RunQuestion }) {
  const questionId = useId();
  const notepadId = useId();
  const speech = useSpeech();
  const { start: listen, stop: stopListening, reset: forgetSpeech } = speech;
  const [status, setStatus] = useState<Status>("answering");
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const speaking = mode === "speak" && speechSupported;
  // Spoken, the question is read aloud before it is answered; typed, it is asked the moment it is up.
  const ask = useAskAloud(question.text, speaking);
  const answering = status === "answering" && !ask.asking;

  /** When this try at the question began. Set as the clock starts, so it is never read before. */
  const startedAt = useRef(0);
  const [spent, setSpent] = useState(0);
  /**
   * Seconds this question already consumed on submissions that failed. The server only banks an
   * Answer's time when the Answer lands, so without this a failed submission would hand the Tenant
   * those seconds back — retry often enough and the countdown never moves.
   */
  const [spentOnFailedTries, setSpentOnFailedTries] = useState(0);
  const left = Math.max(secondsLeft(run) - spentOnFailedTries - spent, 0);

  // The clock, running whenever the question is being answered — which, from the moment it has been
  // asked, it is. It stands still while it is read aloud, and while an answer is on its way to the server.
  useEffect(() => {
    if (!answering) return;
    startedAt.current = Date.now();
    const timer = setInterval(() => setSpent(Math.round((Date.now() - startedAt.current) / 1_000)), 250);
    return () => clearInterval(timer);
  }, [answering]);

  // The microphone is on while a spoken question is being answered, and off the moment it isn't — so it
  // is off while the question is read, or the recogniser would transcribe the voice. The
  // hook keeps it on through the browser ending recognition in a silence, and gives up — saying why —
  // if it can't (see `use-speech.ts`).
  useEffect(() => {
    if (!speaking || !answering) return;
    listen();
    return () => stopListening();
  }, [speaking, answering, listen, stopListening]);

  // Spoken, the answer is anything typed before switching to speech, then what the browser heard —
  // including the phrase still settling, so the last sentence before Submit isn't lost.
  const spoken = [typed, speech.transcript, speech.interim].map((part) => part.trim()).filter(Boolean).join(" ");
  const answer = speaking ? spoken : typed.trim();

  // Out of time, mid-question: the run ends here. What is on the notepad — or what the browser had
  // heard — is kept as this question's Answer, so half an answer is still scored; the questions after
  // it are unreached (interview second pass ticket 03).
  const expired = left === 0 && answering;
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
    const thisTry = Math.max(Math.round((Date.now() - startedAt.current) / 1_000), 0);
    setStatus("submitting");
    setFailure(null);
    const message = await onAnswer({
      questionId: question.id,
      transcript: answer.slice(0, TRANSCRIPT_MAX_CHARS),
      // Everything this question has cost, including tries that failed before this one.
      elapsedSeconds: thisTry + spentOnFailedTries,
    });
    // Landed: the parent puts the next question up, and this one unmounts with its clock.
    if (!message) return;
    // Didn't land: keep what was written, keep what the time cost, and carry on answering.
    setFailure(message);
    setSpentOnFailedTries((current) => current + thisTry);
    setSpent(0);
    setStatus("answering");
  }

  function switchToTyping() {
    // Typing mid-read stops the voice and starts the clock: the question has been asked.
    ask.skip();
    // What was said so far moves onto the page as text, so switching loses nothing.
    setTyped(spoken);
    forgetSpeech();
    onModeChange("type");
  }

  const position = run.questions.findIndex((candidate) => candidate.id === question.id);
  const total = run.questions.length;
  const last = run.questions.every((candidate) => candidate.id === question.id || candidate.answer);
  const submitting = status === "submitting";
  const micState: MicState = !speech.listening || submitting ? "off" : speech.hearing ? "hearing" : "listening";

  return (
    // Centred, unlike every other page's content: while the clock runs this is a stage, not a section
    // of the app, and there is no page title at the frame's edge for it to line up with.
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-muted-foreground">{caption}</p>
          <QuestionTrail questions={run.questions} current={position} />
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Question {position + 1} of {total}
            </span>
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-foreground">
              {CATEGORY_LABEL[question.category]}
            </span>
          </p>
        </div>
        <Clock seconds={left} />
      </div>

      {/* The question is the page's heading: it is what the Tenant is here to answer, and a screen
          reader moving by headings lands on it first. */}
      <h1 id={questionId} className="mt-8 text-2xl leading-snug text-balance sm:mt-12 sm:text-3xl lg:text-4xl">
        {question.text}
      </h1>
      {/* A guide to pace against, never a cut-off: the one countdown above is still the only clock
          (interview second pass ticket 04). */}
      <p className="mt-3 text-sm text-muted-foreground">Aim for about {formatMinutes(ANSWER_MINUTES[question.category])} min</p>

      <div className="mt-8 space-y-4">
        {speaking ? (
          <>
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
                <Soundwave state={micState} />
              )}
              <div className="flex flex-wrap gap-2">
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
                <Button type="button" variant="ghost" className="h-9 px-3" onClick={switchToTyping}>
                  <Keyboard aria-hidden="true" />
                  Type instead
                </Button>
              </div>
            </div>
            {/* Hidden by default: while speaking, the words scrolling past pull the eye away from the
                question. The Tenant can open it to check what the browser caught. */}
            {transcriptShown && (
              <SpokenNotepad id={notepadId} settled={[typed, speech.transcript].filter(Boolean).join(" ")} pending={speech.interim} />
            )}
            {speech.error && (
              <p role="alert" className="text-sm text-destructive">
                {speech.error}
              </p>
            )}
          </>
        ) : (
          <>
            <label htmlFor={notepadId} className="sr-only">
              Your answer to: {question.text}
            </label>
            <TypedNotepad id={notepadId} value={typed} onChange={setTyped} />
            {speechSupported ? (
              <Button type="button" variant="ghost" className="-ml-3 h-9 px-3" onClick={() => onModeChange("speak")}>
                <Mic aria-hidden="true" />
                Speak instead
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{SPEAK_UNSUPPORTED}</p>
            )}
          </>
        )}
      </div>

      {failure && (
        <p role="alert" className="mt-6 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm">
          {failure}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
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
        <span className="block text-4xl leading-none font-semibold sm:text-5xl">{formatClock(seconds)}</span>{" "}
        <span className="mt-1 block text-xs text-muted-foreground">left</span>
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
