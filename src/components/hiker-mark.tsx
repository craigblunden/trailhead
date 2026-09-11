import { cn } from "@/lib/utils";

type HikerMarkProps = {
  className?: string;
};

/**
 * The Trailhead mark: a hiker mid-stride on a meadow, in a round badge. It is
 * the same figure that walks the board's trail, tidied to read at favicon size.
 *
 * Colours are literal rather than theme tokens so the inline mark and the
 * generated icon files (`npm run icons`) are the same picture.
 */
export function HikerMark({ className }: HikerMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("block", className)}
    >
      {/* Sky, then meadow and trail as segments of the same circle, so the
          badge needs no clip path (and no id) when it is inlined many times. */}
      <circle cx={32} cy={32} r={32} fill="#7c94bc" />
      <path
        d="M0.4 27 C 14 24 30 30 63.2 25 A 32 32 0 1 1 0.4 27 Z"
        fill="#a9c68f"
      />
      <path
        d="M10 55.2 C 24 52 40 58 54 55.2 A 32 32 0 0 1 10 55.2 Z"
        fill="#c8a86b"
      />

      <HikerFigure />
    </svg>
  );
}

/** Where the figure's feet meet the ground, in its own coordinates. */
export const HIKER_FEET = { x: 30, y: 52 } as const;

/**
 * The hiker alone, facing right, drawn back to front. Coordinates match the
 * 64-unit badge; scenes place it with a transform anchored at `HIKER_FEET`.
 */
export function HikerFigure() {
  return (
    <g>
      <path
        d="M40 22 L47 52"
        stroke="#8a6a4a"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <rect x={18.5} y={25} width={8} height={13} rx={2.5} fill="#46584c" />
      <path
        d="M28 38 L23.5 52 M32 38 L37 52"
        stroke="#22261f"
        strokeWidth={4.2}
        strokeLinecap="round"
      />
      <path
        d="M26.5 24 h8 a2.5 2.5 0 0 1 2.5 2.4 L38.2 39 H22.8 L24 26.4 a2.5 2.5 0 0 1 2.5 -2.4 Z"
        fill="#d1603f"
      />
      <path
        d="M35.5 27.5 L42.5 34.5"
        stroke="#d1603f"
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <circle cx={43} cy={35} r={2.1} fill="#e8b48c" />
      <circle cx={30.5} cy={16.5} r={5.6} fill="#e8b48c" />
    </g>
  );
}
