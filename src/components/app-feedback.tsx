"use client";

import { MessageSquareHeart, Star } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ActionError, unwrap } from "@/components/action-client";
import { HikerMark } from "@/components/hiker-mark";
import { useSessionUser } from "@/components/session-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  APP_FEEDBACK_CONTEXT_LABEL,
  APP_FEEDBACK_MAX_CHARS,
  APP_FEEDBACK_RATINGS,
  APP_FEEDBACK_RATING_LABELS,
  APP_FEEDBACK_REFUSALS,
  appFeedbackWords,
  type AppFeedbackContext,
  type AppFeedbackRating,
} from "@/lib/app-feedback";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/action-result";
import type { AppFeedbackInput } from "@/server/validation";

type Send = (input: AppFeedbackInput) => Promise<ActionResult<null>>;

type Phase = "writing" | "sending" | "thanked";

/**
 * The header's Feedback button, and the modal behind it: a rating and the user's own words about an
 * issue, an idea, or how it is going, emailed to the owner as App feedback. Every send that arrives
 * is met with thanks — the modal cannot be closed while one is on its way, so the thanks is never
 * missed — and one that fails keeps what was written so nothing has to be typed twice.
 *
 * The same modal can be opened from somewhere in particular (interview second pass ticket 08): a
 * `trigger` of that place's own, and a `context` that the question and the email both name. `onClose`
 * hears the modal close, whether after thanks or without sending.
 */
export function AppFeedback({
  send,
  context,
  trigger,
  onClose,
}: {
  send: Send;
  context?: AppFeedbackContext;
  trigger?: React.ReactElement;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("writing");
  // Remounting the form on each open starts it fresh.
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (!next && phase === "sending") return;
    if (next) {
      setFormKey((key) => key + 1);
      setPhase("writing");
    }
    setOpen(next);
    if (!next) onClose?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className={triggerClass}>
            <TriggerContent />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-md">
        {phase === "thanked" ? (
          <AppFeedbackThanks onDone={() => handleOpenChange(false)} />
        ) : (
          <AppFeedbackForm
            key={formKey}
            send={send}
            context={context}
            sending={phase === "sending"}
            onPhase={setPhase}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const triggerClass = "h-8 gap-1.5 px-2 text-muted-foreground sm:px-2.5";

function TriggerContent() {
  return (
    <>
      <MessageSquareHeart aria-hidden="true" className="size-4" />
      {/* The name stays when the word is hidden on a phone. */}
      <span className="sr-only sm:not-sr-only">Feedback</span>
    </>
  );
}

/** The button's exact footprint while a page loads, so the header does not shift when it arrives. */
export function AppFeedbackPlaceholder() {
  return (
    <span
      aria-hidden="true"
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), triggerClass, "pointer-events-none")}
    >
      <TriggerContent />
    </span>
  );
}

function AppFeedbackThanks({ onDone }: { onDone: () => void }) {
  const user = useSessionUser();
  const firstName = user?.name.split(/\s+/)[0];
  const back = useRef<HTMLButtonElement>(null);

  // The submit button that had focus is gone; the way out takes it.
  useEffect(() => back.current?.focus(), []);

  return (
    <div className="flex flex-col items-center text-center">
      <HikerMark className="mb-4 size-14" />
      <DialogHeader className="items-center">
        <DialogTitle className="text-xl">{firstName ? `Thank you, ${firstName}!` : "Thank you!"}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">
          We really appreciate you taking the time to share this. Every note is read by the person who
          builds Trailhead, and feedback like yours is what shapes where the trail goes next.
        </DialogDescription>
      </DialogHeader>
      <Button ref={back} type="button" className="mt-6 h-10 px-4" onClick={onDone}>
        Back to the trail
      </Button>
    </div>
  );
}

type AppFeedbackFormProps = {
  send: Send;
  context?: AppFeedbackContext;
  sending: boolean;
  onPhase: (phase: Phase) => void;
  onCancel: () => void;
};

function AppFeedbackForm({ send, context, sending, onPhase, onCancel }: AppFeedbackFormProps) {
  const fieldId = useId();
  const [rating, setRating] = useState<AppFeedbackRating | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const words = appFeedbackWords(message);
    const missing: Record<string, string> = {};
    if (rating === null) missing.rating = APP_FEEDBACK_REFUSALS.rating;
    if (words === "") missing.message = APP_FEEDBACK_REFUSALS.message;
    setErrors(missing);
    setFailed(false);
    if (rating === null || words === "") return;

    onPhase("sending");
    try {
      unwrap(await send({ rating, message: words, ...(context ? { context } : {}) }));
      onPhase("thanked");
    } catch (error) {
      onPhase("writing");
      const fields = error instanceof ActionError && error.kind === "invalid" ? error.fields : {};
      if (fields.rating || fields.message) setErrors(fields);
      else setFailed(true);
    }
  }

  const ratingErrorId = `${fieldId}-rating-error`;
  const messageErrorId = `${fieldId}-message-error`;

  return (
    <>
      <DialogHeader className="mb-5">
        <DialogTitle className="text-xl">Share feedback</DialogTitle>
        <DialogDescription>
          Found a bug, have an idea, or just want to say how it’s going? It comes straight to the person who
          builds Trailhead.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <fieldset aria-describedby={errors.rating ? ratingErrorId : undefined} className="space-y-2">
          <legend className="mb-2 text-sm leading-none font-medium">
            How is {context ? `the ${APP_FEEDBACK_CONTEXT_LABEL[context]}` : "Trailhead"} working for you?
          </legend>
          <StarRating
            value={rating}
            onChange={(next) => {
              setRating(next);
              setErrors((current) => {
                const rest = { ...current };
                delete rest.rating;
                return rest;
              });
            }}
          />
          {errors.rating ? (
            <p id={ratingErrorId} role="alert" className="text-xs text-destructive">
              {errors.rating}
            </p>
          ) : (
            <p aria-hidden="true" className="h-4 text-xs text-muted-foreground">
              {rating ? APP_FEEDBACK_RATING_LABELS[rating] : ""}
            </p>
          )}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-message`}>What’s on your mind?</Label>
          <Textarea
            id={`${fieldId}-message`}
            name="message"
            rows={5}
            required
            maxLength={APP_FEEDBACK_MAX_CHARS}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? messageErrorId : undefined}
            placeholder="An issue you hit, a feature you’d love, or what’s working well"
            className="min-h-28"
          />
          {errors.message && (
            <p id={messageErrorId} role="alert" className="text-xs text-destructive">
              {errors.message}
            </p>
          )}
        </div>

        {failed && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            That didn’t send — please try again. Everything you wrote is still here.
          </p>
        )}

        <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-1">
          <Button type="button" variant="outline" className="h-10 px-4" disabled={sending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="h-10 px-4" disabled={sending}>
            {sending ? "Sending…" : "Send feedback"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

type StarRatingProps = {
  value: AppFeedbackRating | null;
  onChange: (rating: AppFeedbackRating) => void;
};

/**
 * Five native radios drawn as stars, so arrow keys, focus and the accessible names come for free.
 * The fieldset around them is the group; they add no second one.
 */
function StarRating({ value, onChange }: StarRatingProps) {
  const name = useId();
  return (
    <div className="flex gap-1">
      {APP_FEEDBACK_RATINGS.map((rating) => {
        const lit = value !== null && rating <= value;
        return (
          <label
            key={rating}
            className="cursor-pointer rounded-md p-1 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
              aria-label={`${rating} ${rating === 1 ? "star" : "stars"}: ${APP_FEEDBACK_RATING_LABELS[rating]}`}
              className="sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn(
                "size-7 transition-colors",
                lit ? "fill-primary text-primary" : "text-muted-foreground/60 hover:text-primary",
              )}
            />
          </label>
        );
      })}
    </div>
  );
}
