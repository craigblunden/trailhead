import { cn } from "@/lib/utils";

/**
 * The ruled page an Answer is written on (interview simulator ticket 06), as the browser transcribes
 * what the Tenant says. `notepad-paper` in `globals.css` draws the rules and the margin.
 *
 * It is read-only — the Tenant is talking, not editing, and answers are spoken only (practice feedback
 * ticket 02) — and the words still settling are shown lighter, the way a pencil note reads before it's
 * inked in.
 */

const PAPER =
  "notepad-paper min-h-[calc(var(--line)*6)] w-full rounded-md text-base text-foreground shadow-[0_1px_0_var(--notepad-rule)] ring-1 ring-foreground/10";

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
