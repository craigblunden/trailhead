"use client";

import { MessageSquareHeart } from "lucide-react";

import { AppFeedback } from "@/components/app-feedback";
import { Button } from "@/components/ui/button";
import { sendAppFeedbackAction } from "@/server/actions/app-feedback";

/**
 * Once, below the Scorecard shown the moment a Tenant's second Attempt is scored: how is the
 * Simulator going? (interview second pass ticket 08). This is App feedback — to the people who make
 * Trailhead — not Feedback about a letter, and its button opens the same form the header's does,
 * marked as about the Interview Simulator so the email says so.
 *
 * The panel decides when it shows, from the scoring response alone; nothing is stored to remember it.
 * Sending or closing the form calls `onDismiss`, and the card is gone for the rest of the visit.
 */
export function FeedbackAsk({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      aria-labelledby="feedback-ask"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex min-w-0 items-start gap-3">
        <MessageSquareHeart aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 id="feedback-ask" className="sr-only">
            How’s the simulator going?
          </h2>
          <p className="text-sm">Two interviews in — how’s the simulator working for you?</p>
        </div>
      </div>
      <AppFeedback
        send={sendAppFeedbackAction}
        context="interview-simulator"
        onClose={onDismiss}
        trigger={
          <Button type="button" variant="outline" size="sm" className="h-9 px-4">
            Tell us
          </Button>
        }
      />
    </section>
  );
}
