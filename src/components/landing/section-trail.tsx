/**
 * Decorative dashed trail, in the board scene's style, running down the left
 * edge of whatever relatively positioned list it sits in. It starts at the
 * first stop's marker and fades out at the bottom, heading on toward the call
 * to action.
 */
export function SectionTrail() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-9 bottom-0 left-[7px] w-1.5 [mask-image:linear-gradient(to_bottom,black_calc(100%-6rem),transparent)] sm:top-10"
    >
      <svg focusable="false" className="h-full w-full">
        <line
          x1="50%"
          y1="0"
          x2="50%"
          y2="100%"
          stroke="var(--trail-path)"
          strokeWidth={6}
          strokeDasharray="24 18"
        />
      </svg>
    </div>
  );
}

/**
 * Waypoint on the section trail, marking where one stop begins. Centred on
 * the trail and level with the stop's heading.
 */
export function TrailMarker() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-7 left-0 size-5 rounded-full border-[5px] border-(--trail-path) bg-background sm:top-8"
    />
  );
}
