import { cn } from "@/lib/utils";

type TrailSceneProps = {
  /**
   * `hero` places the sun behind the ridgeline; `trail` swaps it for the
   * dashed path and hiker used on the board.
   */
  variant?: "hero" | "trail";
  className?: string;
};

type PineProps = {
  x: number;
  baseY: number;
  height: number;
  fill: string;
};

function Pine({ x, baseY, height, fill }: PineProps) {
  const halfWidth = height * 0.32;
  const canopyBottom = baseY - height * 0.16;

  return (
    <g>
      <rect
        x={x - height * 0.035}
        y={canopyBottom - 2}
        width={height * 0.07}
        height={height * 0.2}
        fill="var(--trunk)"
      />
      <path
        d={`M${x} ${baseY - height} L${x + halfWidth} ${canopyBottom} L${x - halfWidth} ${canopyBottom} Z`}
        fill={fill}
      />
    </g>
  );
}

/**
 * The view box starts below y=0 so the band stays shallow without clipping the
 * peaks, and scaling to width keeps the whole scene visible at any size.
 */
export function TrailScene({ variant = "hero", className }: TrailSceneProps) {
  return (
    <svg
      viewBox="0 60 1440 300"
      preserveAspectRatio="xMidYMax meet"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={cn("block h-auto w-full", className)}
    >
      {variant === "hero" && (
        <path d="M1268 232a62 62 0 0 1 124 0Z" fill="var(--sun)" />
      )}

      {/* Ridgeline, far to near */}
      <path d="M150 312 L330 142 L510 312 Z" fill="var(--peak-far)" />
      <path
        d="M330 142 L372 182 L352 192 L332 178 L310 196 L288 182 Z"
        fill="var(--snow)"
      />

      <path d="M1035 312 L1215 156 L1395 312 Z" fill="var(--peak-far)" />
      <path
        d="M1215 156 L1256 196 L1237 206 L1217 192 L1195 210 L1174 196 Z"
        fill="var(--snow)"
      />

      <path d="M545 312 L760 96 L975 312 Z" fill="var(--peak-near)" />
      <path
        d="M760 96 L806 142 L784 153 L762 137 L738 157 L714 142 Z"
        fill="var(--snow)"
      />

      {/* Meadow */}
      <path
        d="M0 300 C 180 272 360 292 540 280 C 720 268 900 268 1080 286 C 1260 304 1360 300 1440 288 L1440 360 L0 360 Z"
        fill="var(--hill-far)"
      />
      <path
        d="M0 326 C 240 302 420 320 660 312 C 900 304 1020 302 1200 318 C 1320 328 1390 328 1440 320 L1440 360 L0 360 Z"
        fill="var(--hill-near)"
      />

      <Pine x={238} baseY={312} height={62} fill="var(--pine-dark)" />
      <Pine x={318} baseY={322} height={46} fill="var(--pine)" />
      <Pine x={1218} baseY={314} height={64} fill="var(--pine-dark)" />
      <Pine x={1310} baseY={326} height={48} fill="var(--pine)" />
      {variant === "trail" && (
        <>
          <Pine x={112} baseY={318} height={70} fill="var(--pine-dark)" />
          <Pine x={470} baseY={330} height={52} fill="var(--pine)" />
        </>
      )}

      {variant === "trail" && (
        <>
          <path
            d="M-20 320 C 200 302 340 334 520 322 C 700 310 900 300 1120 320 C 1280 334 1370 330 1460 312"
            fill="none"
            stroke="var(--trail-path)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="26 20"
          />
          {/* Hiker, mid-trail */}
          <g transform="translate(752 258)">
            <rect x={-16} y={20} width={13} height={19} rx={3} fill="var(--hiker)" opacity={0.75} />
            <circle cx={2} cy={6} r={9} fill="var(--hiker)" />
            <path d="M-4 16 h13 l3 22 h-19 Z" fill="var(--hiker)" />
            <path
              d="M2 38 l-6 20 M8 38 l5 20"
              stroke="var(--foreground)"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M18 20 l4 40"
              stroke="var(--trunk)"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </>
      )}
    </svg>
  );
}
