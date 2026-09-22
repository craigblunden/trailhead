"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Copy, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { jobCache } from "@/components/job-cache";
import { coverLetterClient } from "@/components/job/cover-letter-client";
import { Button } from "@/components/ui/button";
import { CharacterCount } from "@/components/ui/character-count";
import { Excerpt } from "@/components/ui/excerpt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatResetDay, todayUtc } from "@/lib/dates";
import { FEEDBACK_MAX_CHARS, SHORT_DESCRIPTION_CHARS, type Verdict } from "@/lib/generation";
import type { Job } from "@/lib/jobs";
import { optimisticId, withDraft } from "@/lib/jobs-rules";
import type { GenerationStatus } from "@/server/actions/generation";

const STATUS_KEY = ["generation-status"] as const;

const WAITING =
  "Writing your cover letter. This usually takes 10 to 25 seconds — you can keep editing this page.";

/** The count under the Feedback box appears from here, so the cap is seen before it is hit. */
const COUNT_FROM = 400;

type State =
  | { phase: "idle" }
  | { phase: "writing"; startedAt: number; rewrite: boolean }
  | { phase: "written"; letter: string; verdict: Verdict; setAside: boolean }
  | { phase: "failed"; error: string; message: string; refunded: boolean };

/**
 * The cover letter (tickets 13, 18, 19; feedback issue 05). The Job keeps its last Draft (ADR-0002):
 * the card shows it on return with Copy, and under it a Feedback box. Rewrite writes the letter again
 * from the same resume and posting, the Draft, and the Feedback; Write again with the box empty asks
 * first, then writes fresh. Each costs one letter, and each leaves an Activity entry.
 *
 * The waiting state is honest about what it knows. Generation is one request, so there are no fake
 * steps and no Cancel (the request would keep running and the letter would still be counted): an
 * elapsed count against the usual 10–25 seconds, announced once, and a note that the rest of the
 * page stays editable — which it does, because this is a Route Handler, not a queued Server Action.
 *
 * What the writer said about the material comes back with the letter and is explained here: a
 * posting carrying directions aimed at AI tools, a request set aside for going beyond the resume, a
 * first Flag and what a second one means, and a Hold until Monday. On Hold both buttons are off and
 * the Draft stays copyable; nothing else about the page changes.
 */
export function CoverLetterCard({ job, id }: { job: Job; id?: string }) {
  const headingId = useId();
  const feedbackId = useId();
  const letterId = useId();
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: coverLetterClient.status, staleTime: 60_000 });
  const [state, setState] = useState<State>({ phase: "idle" });
  const [feedback, setFeedback] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  // A Draft already on the Job when the page loaded opens as an excerpt; one just written or
  // rewritten in this sitting is shown in full, since the user is here to read it.
  const [letterShown, setLetterShown] = useState(false);

  const quota = status.data;
  // The Plan's letters per week, when there is a number to show; an unlimited Limit has none.
  const perWeek = quota && quota.limit !== "unlimited" ? quota.limit : null;
  const atQuota = quota ? quota.remaining === 0 : false;
  const held = quota?.held === true;
  const writing = state.phase === "writing";
  const hasDescription = job.description.trim().length > 0;
  const canWrite =
    Boolean(quota?.available) && !atQuota && !held && Boolean(job.resume) && hasDescription && !writing;
  // The letter on show: the one just written, else the Job's Draft as the page holds it.
  const letter = state.phase === "written" ? state.letter : job.draft;
  const change = feedback.trim();
  const canRewrite = canWrite && letter.length > 0 && change.length > 0;

  async function write(withFeedback: string) {
    const rewrite = withFeedback.length > 0;
    setCopied(false);
    setConfirming(false);
    setState({ phase: "writing", startedAt: Date.now(), rewrite });
    const result = await coverLetterClient.generate(job.id, withFeedback);
    if (result.quota && quota) {
      queryClient.setQueryData<GenerationStatus>(STATUS_KEY, { ...result.quota, available: quota.available });
    }
    if (result.ok) {
      // The server stored the Draft and its Activity entry; the cached Job is told the same.
      const writtenAt = new Date().toISOString();
      cache.record(job.id, (current) =>
        withDraft(current, { letter: result.letter, rewrite, writtenAt, today: todayUtc() }, optimisticId),
      );
      setFeedback("");
      setState({ phase: "written", letter: result.letter, verdict: result.verdict, setAside: result.setAside });
      // A letter just written is shown in full — the user is here to read it — but "Show less"
      // still works afterward, so this only opens it, never fights a later collapse.
      setLetterShown(true);
    } else if (result.error === "held" && result.quota?.held) {
      // The status now says letters are paused, and until when; the card needs no second line for it.
      setState({ phase: "idle" });
    } else {
      // Only the server knows whether the letter was given back; a guess from the error code could
      // tell the user a letter was not used when it was. The Feedback stays in the box to fix or resend.
      setState({
        phase: "failed",
        error: result.error,
        message: result.message,
        refunded: result.refunded === true,
      });
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const resetDay = quota ? formatResetDay(quota.resetsOn) : "";
  const firstFlag = state.phase === "written" && state.verdict === "feedback" && quota?.flags === 1 && !held;

  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      aria-busy={writing}
      className="scroll-mt-20 rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lg">
          Cover letter
        </h2>
        {quota?.available && perWeek !== null && (
          <p className="text-sm text-muted-foreground">
            {quota.remaining} of {perWeek} left this week
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Written from this job’s description and the resume in its application kit. The cover letter
        comes back as plain text, with no formatting and nothing hidden in it, ready to paste into your
        own cover-letter template. Each cover letter is written by a paid AI model
        {perWeek !== null && `, so there are ${perWeek} a week`}.
      </p>
      {/* On the page from the start: a live region that arrives already holding its text is often
          not announced, so the wait is announced by filling this one. */}
      <p role="status" className="sr-only">
        {writing ? WAITING : ""}
      </p>

      {status.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking your cover letters…</p>
      ) : status.isError ? (
        <p role="alert" className="mt-4 text-sm">
          We couldn’t check how many cover letters you have left.{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => status.refetch()}>
            Try again
          </Button>
        </p>
      ) : !quota?.available ? (
        <p className="mt-4 text-sm">Cover letters aren’t available on this deployment yet.</p>
      ) : (
        <>
          {!job.resume ? (
            <p className="mt-4 text-sm">
              Attach a resume in this job’s application kit to write a cover letter from it.
            </p>
          ) : !hasDescription ? (
            <p className="mt-4 text-sm">
              Paste the job posting into this job’s description to write a cover letter from it.
            </p>
          ) : job.description.trim().length < SHORT_DESCRIPTION_CHARS ? (
            <p className="mt-4 text-sm">
              Short descriptions make generic cover letters. Paste the whole posting into the job
              description for a better one.
            </p>
          ) : null}

          {held ? (
            <p role="status" className="mt-4 text-sm">
              Cover letters are paused until {resetDay}.
            </p>
          ) : (
            atQuota &&
            perWeek !== null &&
            !writing && (
              <p className="mt-4 text-sm">
                You’ve used all {perWeek} cover letters this week. Each one is written fresh by a paid AI
                model; your next {perWeek} arrive {resetDay}.
              </p>
            )
          )}

          {!letter && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="h-9 px-3.5" disabled={!canWrite} onClick={() => write("")}>
                <Sparkles aria-hidden="true" />
                {writing ? "Writing…" : "Write cover letter"}
              </Button>
            </div>
          )}

          {writing && <Writing startedAt={state.startedAt} />}

          {state.phase === "failed" && (
            <div role="alert" className="mt-4 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm">
              <p>{state.message}</p>
              {state.refunded && (
                <p className="mt-1 text-muted-foreground">This didn’t use one of your cover letters.</p>
              )}
              {/* Hidden characters are the user's to remove; resending the same text would be a second Flag. */}
              {canWrite && state.error !== "hidden-feedback" && (letter ? change.length > 0 : true) && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => write(change)}>
                  <RotateCcw aria-hidden="true" />
                  Try again
                </Button>
              )}
            </div>
          )}

          {letter && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {copied ? "Copied to your clipboard." : ""}
                </p>
                <Button className="h-9 px-3.5 shadow-sm" onClick={() => copy(letter)}>
                  <Copy aria-hidden="true" />
                  Copy cover letter
                </Button>
              </div>
              <Excerpt
                expanded={letterShown}
                onToggle={() => setLetterShown((shown) => !shown)}
                collapsedLabel="Show full cover letter"
                expandedLabel="Show less"
                controlsId={letterId}
                preview={letter}
                previewClassName="rounded-md bg-card p-5 ring-1 ring-foreground/10"
              >
                <div
                  id={letterId}
                  role="region"
                  aria-label="Your cover letter"
                  className="rounded-md bg-card p-5 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-foreground/10"
                >
                  {letter}
                </div>
              </Excerpt>
              <p className="mt-2 text-xs text-muted-foreground">Saved with this job. Each write replaces it.</p>

              {state.phase === "written" && state.verdict === "material" && (
                <div
                  role="status"
                  className="mt-3 flex gap-2.5 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm"
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <p>
                    This posting contains instructions aimed at AI tools. The cover letter ignored them;
                    you may want to read the posting for them.
                  </p>
                </div>
              )}
              {state.phase === "written" && state.setAside && (
                <p role="status" className="mt-3 text-sm">
                  The cover letter keeps to what the resume shows; feedback asking for more than that was
                  set aside.
                </p>
              )}
              {firstFlag && (
                <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm">
                  Your feedback contained directions to the writer, which it ignores. A second this week
                  pauses cover letters until {resetDay}.
                </p>
              )}

              <div className="mt-4">
                <label htmlFor={feedbackId} className="block text-sm font-medium">
                  What should change?
                </label>
                <div id={`${feedbackId}-hint`} className="mt-1 text-xs text-muted-foreground">
                  <p>The more specific you are, the better the rewrite. Things worth a look:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>Tone: warmer, more direct, or more formal.</li>
                    <li>Anything on your resume the posting asks for that the cover letter missed.</li>
                    <li>Experience from an earlier role that carries over to this one.</li>
                    <li>Sentences or paragraphs a hiring manager could do without.</li>
                  </ul>
                  <p className="mt-1">A rewrite uses one of your cover letters.</p>
                </div>
                <Textarea
                  id={feedbackId}
                  aria-describedby={`${feedbackId}-hint`}
                  value={feedback}
                  maxLength={FEEDBACK_MAX_CHARS}
                  disabled={writing || held}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Shorter, and lead with the marketplace redesign."
                  className="mt-2 min-h-20 resize-y"
                />
                <CharacterCount length={feedback.length} max={FEEDBACK_MAX_CHARS} from={COUNT_FROM} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button className="h-9 px-3.5" disabled={!canRewrite} onClick={() => write(change)}>
                  <Sparkles aria-hidden="true" />
                  {writing && state.rewrite ? "Rewriting…" : "Rewrite"}
                </Button>
                {change.length === 0 && (
                  <Button
                    variant="outline"
                    className="h-9 px-3.5"
                    disabled={!canWrite}
                    onClick={() => setConfirming(true)}
                  >
                    <RotateCcw aria-hidden="true" />
                    {writing && !state.rewrite ? "Writing…" : "Write again"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={confirming} onOpenChange={(next) => !next && setConfirming(false)}>
        <DialogContent className="gap-0 p-6 sm:max-w-md">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">Write a fresh cover letter?</DialogTitle>
            <DialogDescription>
              It replaces the current draft and uses one of your cover letters.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
            <Button variant="outline" className="h-10 px-4" onClick={() => setConfirming(false)}>
              Keep the draft
            </Button>
            <Button className="h-10 px-4" onClick={() => write("")}>
              Write a fresh cover letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Elapsed seconds against the usual range. The live region above says it once; this is for the eye. */
function Writing({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1_000));

  return (
    <div aria-hidden="true" className="mt-4 rounded-md bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm">{WAITING}</p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {elapsed} s{elapsed > 25 ? " · taking longer than usual" : ""}
      </p>
      <div className="mt-4 space-y-2">
        {[92, 100, 84, 96, 60].map((width, index) => (
          <div key={index} className="h-2.5 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}
