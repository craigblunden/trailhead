"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Copy, RotateCcw, Sparkles } from "lucide-react";

import { coverLetterClient } from "@/components/job/cover-letter-client";
import { Button } from "@/components/ui/button";
import {
  COVER_LETTER_QUOTA,
  REFUNDED_FAILURES,
  SHORT_DESCRIPTION_CHARS,
  formatResetDay,
  type GenerationFailure,
} from "@/lib/generation";
import type { Job } from "@/lib/jobs";
import type { GenerationStatus } from "@/server/actions/generation";

const STATUS_KEY = ["generation-status"] as const;

type State =
  | { phase: "idle" }
  | { phase: "writing"; startedAt: number }
  | { phase: "written"; letter: string }
  | { phase: "failed"; error: string; message: string; refunded: boolean };

/**
 * The cover letter (tickets 13, 18, 19). The letter is never stored: it is text on this screen with
 * a copy button, and writing another replaces it.
 *
 * The waiting state is honest about what it knows. Generation is one request, so there are no fake
 * steps and no Cancel (the request would keep running and the letter would still be counted): an
 * elapsed count against the usual 10–25 seconds, announced once, and a note that the rest of the
 * page stays editable — which it does, because this is a Route Handler, not a queued Server Action.
 */
export function CoverLetterCard({ job }: { job: Job }) {
  const headingId = useId();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: coverLetterClient.status, staleTime: 60_000 });
  const [state, setState] = useState<State>({ phase: "idle" });
  const [copied, setCopied] = useState(false);

  const quota = status.data;
  const atQuota = quota ? quota.remaining === 0 : false;
  const writing = state.phase === "writing";
  const canWrite = Boolean(quota?.available) && !atQuota && Boolean(job.resume) && !writing;

  async function write() {
    setCopied(false);
    setState({ phase: "writing", startedAt: Date.now() });
    const result = await coverLetterClient.generate(job.id);
    if (result.quota && quota) {
      queryClient.setQueryData<GenerationStatus>(STATUS_KEY, { ...result.quota, available: quota.available });
    }
    if (result.ok) {
      setState({ phase: "written", letter: result.letter });
    } else {
      setState({
        phase: "failed",
        error: result.error,
        message: result.message,
        refunded: REFUNDED_FAILURES.includes(result.error as GenerationFailure),
      });
    }
  }

  async function copy(letter: string) {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={writing}
      className="rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lg">
          Cover letter
        </h2>
        {quota?.available && (
          <p className="text-sm text-muted-foreground">
            {quota.remaining} of {quota.limit} left this week
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Written fresh from this job’s description and the resume in its application kit. Each letter is
        written by a paid AI model, so there are {COVER_LETTER_QUOTA} a week.
      </p>

      {status.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking your letters…</p>
      ) : status.isError ? (
        <p role="alert" className="mt-4 text-sm">
          We couldn’t check how many letters you have left.{" "}
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
              Attach a resume in this job’s application kit to write a letter from it.
            </p>
          ) : job.description.trim().length < SHORT_DESCRIPTION_CHARS ? (
            <p className="mt-4 text-sm">
              Short descriptions make generic letters. Paste the whole posting into the job description
              for a better one.
            </p>
          ) : null}

          {atQuota && !writing && (
            <p className="mt-4 text-sm">
              You’ve used all {quota.limit} letters this week. Each one is written fresh by a paid AI
              model; your next {quota.limit} arrive {formatResetDay(quota.resetsOn)}.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button className="h-9 px-3.5" disabled={!canWrite} onClick={write}>
              <Sparkles aria-hidden="true" />
              {writing
                ? "Writing…"
                : state.phase === "written" || state.phase === "failed"
                  ? "Write another"
                  : "Write cover letter"}
            </Button>
          </div>

          {writing && <Writing startedAt={state.startedAt} />}

          {state.phase === "failed" && (
            <div role="alert" className="mt-4 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm">
              <p>{state.message}</p>
              {state.refunded && <p className="mt-1 text-muted-foreground">This didn’t use one of your letters.</p>}
              {canWrite && (
                <Button variant="outline" size="sm" className="mt-3" onClick={write}>
                  <RotateCcw aria-hidden="true" />
                  Try again
                </Button>
              )}
            </div>
          )}

          {state.phase === "written" && (
            <div className="mt-4">
              <div
                role="region"
                aria-label="Your cover letter"
                className="rounded-md bg-card p-5 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-foreground/10"
              >
                {state.letter}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" className="h-9 px-3.5" onClick={() => copy(state.letter)}>
                  <Copy aria-hidden="true" />
                  Copy letter
                </Button>
                <p role="status" className="text-sm text-muted-foreground">
                  {copied ? "Copied to your clipboard." : ""}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This letter isn’t saved. Copy it before you leave the page.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Elapsed seconds against the usual range. Announced once; the counter itself is not read out. */
function Writing({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1_000));

  return (
    <div className="mt-4 rounded-md bg-card p-5 ring-1 ring-foreground/10">
      <p role="status" className="text-sm">
        Writing your cover letter. This usually takes 10 to 25 seconds — you can keep editing this page.
      </p>
      <p aria-hidden="true" className="mt-1 text-xs text-muted-foreground tabular-nums">
        {elapsed} s{elapsed > 25 ? " · taking longer than usual" : ""}
      </p>
      <div aria-hidden="true" className="mt-4 space-y-2">
        {[92, 100, 84, 96, 60].map((width, index) => (
          <div key={index} className="h-2.5 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}
