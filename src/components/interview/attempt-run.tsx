"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Keyboard, Mic, MicOff } from "lucide-react";

import { useSpeech } from "@/components/interview/use-speech";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_LABEL,
  SPEAK_UNSUPPORTED,
  TRANSCRIPT_MAX_CHARS,
  formatClock,
  nextQuestion,
  remainingSeconds,
  type Attempt,
  type InputMode,
} from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * Answering an Attempt (interview simulator tickets 02, 06): one question at a time, one countdown
 * for the whole Attempt, and an untimed pause between questions.
 *
 * The clock is **active-time accounted**. It runs only while a question is actually being answered —
 * never during the pause, and never while the page is closed. What the server stores is the seconds
 * each Answer consumed, added as the Answer lands, so the budget a returning Tenant sees is exactly
 * what they left. This component's own countdown is display and expiry; the Attempt's real time is
 * whatever the server has added up.
 *
 * Spoken answers are transcribed by the browser and nothing else: no audio is recorded, uploaded, or
 * stored (see `use-speech.ts`). Both modes write the same transcript, so scoring cannot tell which
 * was used.
 */

export type AttemptRunProps = {
  attempt: Attempt;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  speechSupported: boolean;
  /** Records one Answer. Resolves with the Attempt as the server then holds it, or a message. */
  onAnswer: (answer: { questionId: string; transcript: string; elapsedSeconds: number }) => Promise<string | null>;
  /** The countdown reached zero mid-question: the Attempt ends where it stands. */
  onTimeUp: () => Promise<string | null>;
};

type Phase =
  /** Between questions, and before the first: the clock is stopped and the Tenant decides when to go on. */
  | { kind: "paused" }
  | { kind: "answering"; startedAt: number }
  | { kind: "submitting" };

export function AttemptRun({
  attempt,
  mode,
  onModeChange,
  speechSupported,
  onAnswer,
  onTimeUp,
}: AttemptRunProps) {
  const fieldId = useId();
  const question = nextQuestion(attempt);
  const [phase, setPhase] = useState<Phase>({ kind: "paused" });
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const speech = useSpeech();

  /** The budget as the server holds it, less whatever this question has already burned. */
  const banked = remainingSeconds(attempt);
  const [spent, setSpent] = useState(0);
  const left = Math.max(banked - spent, 0);
  const answered = attempt.questions.filter((candidate) => candidate.answer).length;

  // The countdown, ticking only while a question is open. A pause stops it outright rather than
  // pretending to run, which is what makes "the pause is untimed" true rather than approximate.
  useEffect(() => {
    if (phase.kind !== "answering") return;
    const timer = setInterval(() => setSpent(Math.round((Date.now() - phase.startedAt) / 1_000)), 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Out of time, mid-question: the Attempt ends here. Whatever is in the box is not recorded, and
  // the remaining questions are simply left unanswered — nothing is force-submitted.
  const expired = left === 0 && phase.kind === "answering";
  const ending = useRef(false);
  useEffect(() => {
    if (!expired || ending.current) return;
    ending.current = true;
    speech.stop();
    void onTimeUp().then((message) => setFailure(message));
  }, [expired, onTimeUp, speech]);

  if (!question) return null;

  const transcript = mode === "speak" ? [speech.transcript, speech.interim].filter(Boolean).join(" ") : typed;
  const submittable = mode === "speak" ? speech.transcript.trim() : typed.trim();

  function begin() {
    setFailure(null);
    setTyped("");
    speech.reset();
    setSpent(0);
    setPhase({ kind: "answering", startedAt: Date.now() });
    if (mode === "speak" && speechSupported) speech.start();
  }

  async function submit() {
    if (phase.kind !== "answering") return;
    const elapsedSeconds = Math.max(Math.round((Date.now() - phase.startedAt) / 1_000), 0);
    speech.stop();
    setPhase({ kind: "submitting" });
    const message = await onAnswer({
      questionId: question!.id,
      transcript: submittable.slice(0, TRANSCRIPT_MAX_CHARS),
      elapsedSeconds,
    });
    setFailure(message);
    // Whether it landed or not, the clock stops here: a failed submission must not keep burning
    // time the Tenant can't answer in. On success the parent hands down the next question.
    setSpent(0);
    setPhase({ kind: "paused" });
    if (!message) {
      setTyped("");
      speech.reset();
    }
  }

  const answering = phase.kind === "answering";
  const submitting = phase.kind === "submitting";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          Question {answered + 1} of {attempt.questions.length} ·{" "}
          <span className="font-medium text-foreground">{CATEGORY_LABEL[question.category]}</span>
        </p>
        {/* The one live region on the page: the clock, announced politely rather than on every tick. */}
        <p
          role="timer"
          aria-live="off"
          className={cn("font-mono text-lg tabular-nums", left <= 30 && "text-destructive")}
        >
          {formatClock(left)} left
        </p>
      </div>

      <p className="max-w-prose text-xl leading-snug">{question.text}</p>

      {!answering && !submitting && (
        <div className="space-y-3">
          {/* The pause is untimed and says so, so nobody hurries through it thinking it costs them. */}
          <p className="text-sm text-muted-foreground">
            Take as long as you need — the clock is stopped and starts again when you do.
          </p>
          <Button type="button" className="h-10 px-5" onClick={begin}>
            {answered === 0 ? "Start answering" : "Next question"}
          </Button>
        </div>
      )}

      {(answering || submitting) && (
        <div className="space-y-3">
          {mode === "speak" && speechSupported ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                {speech.listening ? (
                  <>
                    <Mic aria-hidden="true" className="size-4 text-primary" /> Listening — say your answer out loud
                  </>
                ) : (
                  <>
                    <MicOff aria-hidden="true" className="size-4" /> Not listening
                  </>
                )}
              </p>
              <p
                aria-live="polite"
                className="min-h-24 rounded-md border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap"
              >
                {transcript || <span className="text-muted-foreground">Your words appear here as you speak.</span>}
              </p>
              {speech.error && (
                <p role="alert" className="text-sm text-destructive">
                  {speech.error}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  speech.stop();
                  setTyped(speech.transcript);
                  onModeChange("type");
                }}
              >
                <Keyboard aria-hidden="true" className="size-4" />
                Type this answer instead
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor={fieldId} className="text-sm font-medium">
                Your answer
              </label>
              <Textarea
                id={fieldId}
                value={typed}
                autoFocus
                rows={6}
                maxLength={TRANSCRIPT_MAX_CHARS}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Answer as you would out loud."
              />
              {!speechSupported && <p className="text-xs text-muted-foreground">{SPEAK_UNSUPPORTED}</p>}
            </div>
          )}

          <Button type="button" className="h-10 px-5" disabled={submitting || !submittable} onClick={submit}>
            {submitting ? "Saving your answer…" : "Submit answer"}
          </Button>
        </div>
      )}

      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
    </div>
  );
}
