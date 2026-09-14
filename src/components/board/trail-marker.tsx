import type { Stage } from "@/lib/jobs";

/*
 * The trail's two ends, planted on top of the board's columns: the trailhead on Applied, where the
 * climb starts, and the finish on Offer. Drawn in the landscape's flat palette (see `TrailScene`),
 * and decorative only: each column's heading already says where it is.
 */

type MarkerProps = { className?: string };

/** The meadow a marker is planted in, sitting on the column's top edge. */
function Mound() {
  return <path d="M18 64 C 25 57.5 47 57.5 54 64 Z" fill="var(--hill-near)" />;
}

/** A post with a routed plank pointing on up the trail, a snow-capped peak burned into it. */
function TrailheadMarker({ className }: MarkerProps) {
  return (
    <svg viewBox="0 0 72 64" aria-hidden="true" focusable="false" className={className}>
      <Mound />
      <rect x={33} y={6} width={6} height={56} fill="var(--trunk)" />
      <path d="M31.5 6 L36 1.5 L40.5 6 Z" fill="#6b4a2e" />

      <path
        d="M8 16 H56 L64 25 L56 34 H8 Z"
        fill="#b08658"
        stroke="var(--trunk)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M13 31 L22 19 L31 31 Z" fill="var(--peak-near)" />
      <path d="M22 19 L24.7 22.6 L23.2 23.4 L22 22.2 L20.8 23.4 L19.3 22.6 Z" fill="var(--snow)" />
      <rect x={36} y={21.4} width={14} height={2.2} fill="#6b4a2e" />
      <rect x={36} y={26.4} width={10} height={2.2} fill="#6b4a2e" />
    </svg>
  );
}

/**
 * A signed contract pinned to a post on a cairn: the top of the trail. The sheet is the notice
 * board's paper (see `NoticeBoard` in `TrailScene`), with a signature and a wax seal.
 */
function FinishMarker({ className }: MarkerProps) {
  return (
    <svg viewBox="0 0 72 64" aria-hidden="true" focusable="false" className={className}>
      <Mound />
      <rect x={34} y={20} width={4} height={27} fill="var(--trunk)" />

      <g transform="rotate(-3 36 20)">
        <path
          d="M22 3 H44 L50 9 V38 H22 Z"
          fill="var(--snow)"
          stroke="#c9cfc0"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <path d="M44 3 V9 H50 Z" fill="#dfe3d8" />
        <rect x={26} y={9} width={13} height={2.4} fill="#6b4a2e" />
        {[15, 19, 23].map((y, i) => (
          <rect key={y} x={26} y={y} width={i === 1 ? 16 : 20} height={1.6} fill="#b7bdae" />
        ))}
        <path
          d="M26 32 C 27.5 28 29.5 28 29.5 31 S 32.5 34 34 29.5 S 36.5 30 38 31.5"
          fill="none"
          stroke="#4c7a9c"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <path d="M42.5 33 L41 38.5 L43 37.4 L44.3 39 L45 33.5 Z" fill="#d1603f" />
        <circle cx={44} cy={31.5} r={3.6} fill="var(--hiker)" />
        <circle cx={44} cy={31.5} r={1.6} fill="#d1603f" />
        <circle cx={36} cy={5.5} r={2} fill="#d1603f" />
      </g>

      <ellipse cx={36} cy={58} rx={13} ry={5} fill="#9aa39a" />
      <ellipse cx={34.5} cy={51.5} rx={9.5} ry={4.2} fill="#858e85" />
      <ellipse cx={36.5} cy={46} rx={6.5} ry={3.4} fill="#9aa39a" />
    </svg>
  );
}

const MARKERS: Partial<Record<Stage, (props: MarkerProps) => React.ReactNode>> = {
  applied: TrailheadMarker,
  offer: FinishMarker,
};

/**
 * The marker standing on a column (which must be `relative`), if its Stage has one. It stands toward
 * the column's end, clear of the title row's heading and button. Only from `xl`, where the columns
 * sit in one row: below it a column wraps under another and there is no room above. The board's
 * loading outline draws it too, so it is already standing when the page arrives.
 */
export function StageMarker({ stage }: { stage: Stage }) {
  const Marker = MARKERS[stage];
  if (!Marker) return null;
  return <Marker className="pointer-events-none absolute right-4 bottom-full hidden h-14 w-auto xl:block" />;
}
