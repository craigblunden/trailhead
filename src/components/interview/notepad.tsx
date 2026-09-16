import { TRANSCRIPT_MAX_CHARS } from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * The ruled page an Answer is written on (interview simulator ticket 06): the same paper whether the
 * Tenant is typing onto it or watching the browser transcribe what they say. `notepad-paper` in
 * `globals.css` draws the rules and the margin.
 *
 * Typed, it is the answer field. Spoken, it is read-only — the Tenant is talking, not editing — and
 * the words still settling are shown lighter, the way a pencil note reads before it's inked in.
 */

const PAPER =
  "notepad-paper min-h-[calc(var(--line)*6)] w-full rounded-md text-base text-foreground shadow-[0_1px_0_var(--notepad-rule)] ring-1 ring-foreground/10";

export function TypedNotepad({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={6}
      maxLength={TRANSCRIPT_MAX_CHARS}
      autoFocus
      onChange={(event) => onChange(event.target.value)}
      placeholder="Answer as you would out loud."
      className={cn(
        PAPER,
        "resize-y outline-none placeholder:text-muted-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}

export function SpokenNotepad({
  id,
  settled,
  pending,
  className,
}: {
  id: string;
  /** What the recogniser has committed to. */
  settled: string;
  /** What it is still working out. */
  pending: string;
  className?: string;
}) {
  const empty = !settled && !pending;
  return (
    <div id={id} className={cn(PAPER, "whitespace-pre-wrap", className)}>
      {empty ? (
        <span className="text-muted-foreground/70">Your words appear here as you speak.</span>
      ) : (
        <>
          {settled}
          {settled && pending ? " " : null}
          {pending && <span className="text-muted-foreground">{pending}</span>}
        </>
      )}
    </div>
  );
}
