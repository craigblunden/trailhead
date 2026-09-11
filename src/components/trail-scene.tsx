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

type MountainProps = {
  apexX: number;
  apexY: number;
  baseY: number;
  halfWidth: number;
  fill: string;
};

/**
 * A peak whose snow cap is derived from the slope, so its outer edges sit
 * exactly on the mountain and its notches mirror about the apex.
 */
function Mountain({ apexX, apexY, baseY, halfWidth, fill }: MountainProps) {
  const run = halfWidth / (baseY - apexY);
  const capDepth = (baseY - apexY) * 0.24;
  const capY = apexY + capDepth;
  const capHalf = capDepth * run;
  const notch = capDepth * 0.28;

  const cap = [
    [apexX, apexY],
    [apexX + capHalf, capY],
    [apexX + capHalf * 0.55, capY + notch],
    [apexX + capHalf * 0.2, capY - notch * 0.6],
    [apexX, capY + notch * 0.2],
    [apexX - capHalf * 0.2, capY - notch * 0.6],
    [apexX - capHalf * 0.55, capY + notch],
    [apexX - capHalf, capY],
  ]
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  return (
    <g>
      <path
        d={`M${apexX - halfWidth} ${baseY} L${apexX} ${apexY} L${apexX + halfWidth} ${baseY} Z`}
        fill={fill}
      />
      <path d={`${cap} Z`} fill="var(--snow)" />
    </g>
  );
}

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
        <circle cx={1338} cy={236} r={64} fill="var(--sun)" />
      )}

      {/* Ridgeline, far to near */}
      <Mountain
        apexX={330}
        apexY={142}
        baseY={312}
        halfWidth={180}
        fill="var(--peak-far)"
      />
      <Mountain
        apexX={1215}
        apexY={156}
        baseY={312}
        halfWidth={180}
        fill="var(--peak-far)"
      />
      <Mountain
        apexX={760}
        apexY={96}
        baseY={312}
        halfWidth={215}
        fill="var(--peak-near)"
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
            stroke="#C2A878"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="26 20"
          />
          {/* Hiker, mid-trail */}
          <g transform="translate(752 258)">
            {/* Bag */}
            <rect
              x={-16}
              y={20}
              width={13}
              height={19}
              rx={3}
              fill="#46584C"
              opacity={0.75}
            />
            {/* Head */}
            <circle cx={2} cy={6} r={9} fill="#E8B48C" />
            {/* Hand */}
            <path
              d="M18 20 l4 40"
              stroke="#D1603F"
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              transform="rotate(-55)"
            />
            {/* Shirt */}
            <path d="M-4 16 h13 l3 22 h-19 Z" fill="#D1603F" />
            {/* Legs */}
            <path
              d="M2 38 l-6 20 M8 38 l5 20"
              stroke="#000"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />
            {/* Stick */}
            <path
              d="M18 20 l4 40"
              stroke="var(--trunk)"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              transform="rotate(-10)"
            />
          </g>
        </>
      )}
    </svg>
  );
}
