import { cn } from "@/lib/utils";

/**
 * What the microphone is doing, as five bars and a few words (interview simulator ticket 06).
 *
 * - `off` — the page isn't listening. Flat and still.
 * - `listening` — the recogniser is running and waiting. A low, slow breath, so a Tenant who pauses
 *   to think can see the page is still with them.
 * - `hearing` — the recogniser has picked up speech. Full movement.
 *
 * The states come from the Speech API's own events, never a level meter (see `use-speech.ts`), so the
 * bars show whether *speech* is being heard rather than bouncing to a cough or a door. The picture is
 * decoration; the words beside it carry the state, and under reduced motion the bars stand still at a
 * height per state (`globals.css`).
 */

export type MicState = "off" | "listening" | "hearing";

/** Each bar's share of the reach: highest in the middle, so the peak reads as a wave. */
export const SOUNDWAVE_SHAPE = [0.45, 0.75, 1, 0.7, 0.5];

/** Staggered so the bars ripple outward rather than pulse as one. */
export const SOUNDWAVE_DELAY_MS = [120, 60, 0, 90, 150];

const WORDS: Record<MicState, string> = {
  off: "Microphone off",
  listening: "Listening. Say your answer out loud.",
  hearing: "Hearing you",
};

export function Soundwave({
  state,
  words,
  className,
}: {
  state: MicState;
  /** Said in place of the state's own words — "Your turn" before anything has been heard. */
  words?: string;
  className?: string;
}) {
  return (
    <div data-mic={state} className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-11 w-16 shrink-0 items-center justify-center gap-1 rounded-full",
          state === "off" ? "bg-muted" : "bg-primary/10",
        )}
      >
        {SOUNDWAVE_SHAPE.map((shape, index) => (
          <span
            key={index}
            style={{ "--shape": shape, animationDelay: `${SOUNDWAVE_DELAY_MS[index]}ms` } as React.CSSProperties}
            className={cn(
              "soundwave-bar block h-7 w-1 rounded-full",
              state === "off" ? "bg-muted-foreground/50" : "bg-primary",
            )}
          />
        ))}
      </span>
      <span className={cn("text-[0.9375rem]", state === "off" ? "text-muted-foreground" : "font-medium")}>
        {words ?? WORDS[state]}
      </span>
    </div>
  );
}
