import { HIKER_FEET, HikerFigure } from "@/components/hiker-mark";
import { cn } from "@/lib/utils";

type LoadingTrailProps = {
  /** What is on its way, in the page's own words: "Loading your trail…". */
  children: string;
  /** `lg` for the wait standing alone in the space a card's content will fill. */
  size?: "sm" | "lg";
  className?: string;
};

const MARK = {
  sm: "h-8 w-24",
  lg: "h-12 w-36",
} as const;

/**
 * Every wait in the signed-in app, said once: the hiker from the board's trail, with the path
 * moving under their feet, beside a sentence that names what is loading. The sentence is the status
 * region; the picture is decoration. Under reduced motion the path stands still.
 *
 * Dash and gap keep the board trail's 26:20 rhythm, and the march loops over one dash-and-gap, so
 * the pattern never jumps.
 */
export function LoadingTrail({ children, size = "sm", className }: LoadingTrailProps) {
  return (
    <div
      role="status"
      className={cn(
        // Wraps rather than widens: on a narrow screen the sentence may sit under the marker.
        "flex flex-wrap items-center gap-3 text-sm text-muted-foreground",
        size === "lg" && "justify-center gap-4",
        className,
      )}
    >
      <TrailMark className={MARK[size]} />
      <span>{children}</span>
    </div>
  );
}

/** The hiker and the moving path, without words: for a wait whose sentence is placed separately. */
export function TrailMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <path
        d="M2 32 C 30 27 58 36 118 30"
        fill="none"
        stroke="var(--trail-path)"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray="13 10"
        className="loading-trail-path"
      />
      <g
        transform={`translate(62 32) scale(0.6) translate(${-HIKER_FEET.x} ${-HIKER_FEET.y})`}
      >
        <HikerFigure />
      </g>
    </svg>
  );
}
