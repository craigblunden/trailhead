"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { SpeechUnsupported } from "@/components/interview/interview-path";
import { HeldRunScreen, RunScreen } from "@/components/interview/run-screen";
import { primeSpeech } from "@/components/interview/use-ask-aloud";
import { useSpeech, useSpeechSupported } from "@/components/interview/use-speech";
import { rememberTutorialSeen, useTutorialSeen } from "@/components/interview/use-tutorial-seen";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/jobs";
import type { Plan } from "@/lib/plans";
import { PRACTICE_QUESTION_COUNT, canStartPracticeRound } from "@/lib/practice";
import { TUTORIAL_RUN, TUTORIAL_SECONDS, afterTutorial } from "@/lib/tutorial";
import { cn } from "@/lib/utils";

/**
 * The **Tutorial** (practice feedback ticket 06): one guided question on the real run screen. Before any
 * clock runs, it points out, one at a time, how many questions there are, the clock, and the microphone —
 * whose button is the tap that asks the browser for it, so the permission prompt comes up here, explained,
 * rather than in the middle of a first real answer. Then the question is read and answered as any is, with
 * Submit pointed out once there is something to submit. Nothing is sent anywhere: submitting ends the
 * Tutorial in the page, read back, and this device remembers it was done.
 */

type Step = "count" | "clock" | "microphone" | "running" | "end";

export function TutorialPanel({ plan }: { plan: Plan }) {
  const speechSupported = useSpeechSupported();
  const [step, setStep] = useState<Step>("count");
  const [said, setSaid] = useState("");
  const [transcriptShown, setTranscriptShown] = useState(true);
  const next = afterTutorial(plan);

  // The microphone step's own recogniser: started by the tap, and put away as soon as the browser opens the
  // microphone — the run's recogniser takes over from there.
  const microphone = useSpeech({
    onAudioStart: () => {
      microphone.reset();
      setStep("running");
    },
  });

  function turnOnMicrophone() {
    // In the tap: the voice, so a phone lets the question be read, and the microphone, so the browser asks.
    primeSpeech();
    microphone.start();
  }

  async function finish({ transcript }: { transcript: string }) {
    setSaid(transcript);
    setStep("end");
    rememberTutorialSeen();
    return null;
  }

  let body: React.ReactNode;
  if (!speechSupported) {
    body = (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-3xl tracking-tight">Tutorial</h1>
        <SpeechUnsupported className="max-w-sm" />
      </div>
    );
  } else if (step === "running") {
    body = (
      <RunScreen
        run={TUTORIAL_RUN}
        caption="Tutorial"
        transcriptShown={transcriptShown}
        onTranscriptShownChange={setTranscriptShown}
        onAnswer={finish}
        onTimeUp={finish}
        onLeave={() => setStep("microphone")}
        submitCallout={<Callout>Press Submit when you’ve finished answering.</Callout>}
      />
    );
  } else if (step === "end") {
    body = (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl tracking-tight">Tutorial</h1>
          <p className="mt-1 text-lg">That’s how every question works.</p>
        </div>
        <section aria-labelledby="tutorial-said" className="space-y-2">
          <h2 id="tutorial-said" className="text-sm font-medium text-muted-foreground">
            What you said
          </h2>
          <p className="notepad-paper rounded-md p-3 text-base whitespace-pre-wrap ring-1 ring-foreground/10">
            {said || "Nothing was heard that time."}
          </p>
        </section>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button asChild className="h-11 px-6 text-base">
            <Link href={next.href}>{next.label}</Link>
          </Button>
          <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setStep("count")}>
            Go through it again
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <HeldRunScreen run={TUTORIAL_RUN} caption="Tutorial">
        {step === "count" && (
          <Callout onNext={() => setStep("clock")}>
            Questions come one at a time. This tutorial has one;{" "}
            {canStartPracticeRound(plan)
              ? `a practice round has ${PRACTICE_QUESTION_COUNT}.`
              : "an interview has several, across five areas."}
          </Callout>
        )}
        {step === "clock" && (
          <Callout align="end" onNext={() => setStep("microphone")}>
            There is one countdown for the whole run — {pluralize(TUTORIAL_SECONDS / 60, "minute")} here — and it only
            runs while you’re answering.
          </Callout>
        )}
        {step === "microphone" && (
          <Callout>
            <p>
              You answer out loud, so the page needs your microphone. Nothing is recorded: your browser turns what you
              say into words.
            </p>
            {microphone.listening && !microphone.error ? (
              <p className="mt-3 font-medium">Allow the microphone when your browser asks.</p>
            ) : (
              <Button type="button" className="mt-3 h-10 px-4" onClick={turnOnMicrophone}>
                <Mic aria-hidden="true" />
                {microphone.error ? "Try again" : "Turn on my microphone"}
              </Button>
            )}
            {microphone.error && (
              <p role="alert" className="mt-3 text-destructive">
                {microphone.error}
              </p>
            )}
          </Callout>
        )}
      </HeldRunScreen>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />
      <PageMain className="pt-4 sm:pt-16">
        {step !== "end" && step !== "running" && speechSupported && (
          <div className="mx-auto mb-4 flex max-w-3xl justify-between gap-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/interview">
                <ArrowLeft aria-hidden="true" />
                Interview Simulator
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={next.href} onClick={rememberTutorialSeen}>
                Skip the tutorial
              </Link>
            </Button>
          </div>
        )}
        {body}
      </PageMain>
    </div>
  );
}

/**
 * One of the Tutorial's pointers: what to notice, and Next. Focus moves to it as it appears, so the steps
 * read in order with a keyboard or a screen reader.
 */
function Callout({
  align = "start",
  onNext,
  children,
}: {
  align?: "start" | "end";
  onNext?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="note"
      tabIndex={-1}
      className={cn(
        "max-w-sm rounded-md bg-primary/5 p-3 text-sm ring-1 ring-primary/30 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        align === "end" && "ml-auto",
      )}
    >
      {children}
      {onNext && (
        <div className="mt-3">
          <Button type="button" variant="outline" className="h-9 px-3" onClick={onNext}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The offer of the Tutorial to a Tenant new to the Simulator — no finished Practice round or Attempt, and
 * this device hasn't finished or skipped it (practice feedback ticket 06). Where there is no offer, a plain
 * link to it stands in, when `linkOtherwise`, so it is always a click away.
 */
export function TutorialOffer({ newToSimulator, linkOtherwise = false }: { newToSimulator: boolean; linkOtherwise?: boolean }) {
  const speechSupported = useSpeechSupported();
  const [seen, remember] = useTutorialSeen();
  if (!speechSupported) {
    // The Tutorial needs a browser that can hear the Tenant, so the link says why there is none.
    return linkOtherwise ? <p className="mt-2 text-sm text-muted-foreground">The tutorial needs a browser that can hear you.</p> : null;
  }
  if (!newToSimulator || seen) {
    return linkOtherwise ? (
      <p className="mt-2 text-sm">
        <Link href="/interview/tutorial" className="font-medium text-primary underline-offset-3 hover:underline">
          Take the tutorial
        </Link>
        <span className="text-muted-foreground"> to see how a run works.</span>
      </p>
    ) : null;
  }
  return (
    <section
      aria-labelledby="tutorial-offer"
      className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-primary/30 bg-card/70 p-4"
    >
      <div className="min-w-0 basis-64">
        <h2 id="tutorial-offer" className="text-lg">
          New to the Interview Simulator?
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A one-question tutorial shows how the questions, the clock, and your microphone work.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="h-10 px-5">
          <Link href="/interview/tutorial">Take the tutorial</Link>
        </Button>
        <Button type="button" variant="ghost" className="h-10 px-4" onClick={remember}>
          Skip
        </Button>
      </div>
    </section>
  );
}
