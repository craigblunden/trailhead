import { HIKER_FEET, HikerFigure } from "@/components/hiker-mark";
import { cn } from "@/lib/utils";

type TrailSceneProps = {
  /**
   * `hero` places the sun behind the ridgeline; `trail` swaps it for the
   * dashed path and the signed-in sections' foregrounds (see `SectionScene`).
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
export function Mountain({ apexX, apexY, baseY, halfWidth, fill }: MountainProps) {
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

export function Pine({ x, baseY, height, fill }: PineProps) {
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

/** The board's hiker, placed by where their feet meet the ground. */
function Hiker({
  x,
  baseY,
  facing = "right",
  jacket,
}: {
  x: number;
  baseY: number;
  facing?: "left" | "right";
  jacket?: string;
}) {
  const scaleX = facing === "right" ? 1.5 : -1.5;
  return (
    <g transform={`translate(${x} ${baseY}) scale(${scaleX} 1.5) translate(${-HIKER_FEET.x} ${-HIKER_FEET.y})`}>
      <HikerFigure jacket={jacket} />
    </g>
  );
}

function Tent({ x, baseY }: { x: number; baseY: number }) {
  return (
    <g>
      <path d={`M${x - 36} ${baseY} L${x} ${baseY - 44} L${x} ${baseY} Z`} fill="#e0a052" />
      <path d={`M${x} ${baseY - 44} L${x + 36} ${baseY} L${x} ${baseY} Z`} fill="#c9803a" />
      <path d={`M${x - 9} ${baseY} L${x} ${baseY - 26} L${x + 9} ${baseY} Z`} fill="#6b4a2e" />
    </g>
  );
}

export function Campfire({ x, baseY }: { x: number; baseY: number }) {
  return (
    <g>
      <path
        d={`M${x - 16} ${baseY + 2} L${x + 16} ${baseY - 8} M${x - 16} ${baseY - 8} L${x + 16} ${baseY + 2}`}
        stroke="var(--trunk)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d={`M${x} ${baseY - 34} C ${x + 12} ${baseY - 20} ${x + 16} ${baseY - 10} ${x + 8} ${baseY - 2} C ${x + 4} ${baseY + 2} ${x - 4} ${baseY + 2} ${x - 8} ${baseY - 2} C ${x - 16} ${baseY - 10} ${x - 12} ${baseY - 20} ${x} ${baseY - 34} Z`}
        fill="var(--hiker)"
      />
      <path
        d={`M${x} ${baseY - 20} C ${x + 7} ${baseY - 12} ${x + 8} ${baseY - 6} ${x + 4} ${baseY - 2} C ${x + 2} ${baseY} ${x - 2} ${baseY} ${x - 4} ${baseY - 2} C ${x - 8} ${baseY - 6} ${x - 7} ${baseY - 12} ${x} ${baseY - 20} Z`}
        fill="var(--sun)"
      />
      {[-22, -12, 12, 22].map((dx) => (
        <ellipse key={dx} cx={x + dx} cy={baseY + 3} rx={5} ry={3.5} fill="#9aa39a" />
      ))}
    </g>
  );
}

/** A trailhead kiosk under a little roof, with resumes and letters pinned to it. */
function NoticeBoard({ x, baseY }: { x: number; baseY: number }) {
  const top = baseY - 62;
  const sheets = [
    { dx: -36, dy: 8, w: 22, h: 28, turn: -4, pin: "#d1603f" },
    { dx: -10, dy: 6, w: 24, h: 31, turn: 2, pin: "#4c7a9c" },
    { dx: 20, dy: 10, w: 19, h: 24, turn: 5, pin: "#d1603f" },
  ];

  return (
    <g>
      <rect x={x - 41} y={top - 6} width={6} height={68} fill="var(--trunk)" />
      <rect x={x + 35} y={top - 6} width={6} height={68} fill="var(--trunk)" />
      <rect x={x - 46} y={top} width={92} height={44} rx={2} fill="#b08658" stroke="var(--trunk)" strokeWidth={3} />
      <path d={`M${x - 56} ${top - 2} L${x} ${top - 24} L${x + 56} ${top - 2} Z`} fill="#6b4a2e" />
      {sheets.map(({ dx, dy, w, h, turn, pin }) => (
        <g key={dx} transform={`rotate(${turn} ${x + dx + w / 2} ${top + dy + h / 2})`}>
          <rect x={x + dx} y={top + dy} width={w} height={h} fill="var(--snow)" />
          {[7, 12, 17].map((ly) => (
            <rect key={ly} x={x + dx + 4} y={top + dy + ly} width={w - 8} height={1.6} fill="#c9cfc0" />
          ))}
          <circle cx={x + dx + w / 2} cy={top + dy + 2.5} r={2} fill={pin} />
        </g>
      ))}
    </g>
  );
}

/**
 * The Interview Simulator's interviewer: an owl on a stump, clipboard under one wing, hearing the hiker
 * out. Drawn in the scene's flat shapes and palette, so it belongs to the same trail.
 */
function OwlInterviewer({ x, baseY }: { x: number; baseY: number }) {
  const stumpTop = baseY - 30;
  const cy = stumpTop - 19;
  return (
    <g>
      {/* The stump, with its cut face. */}
      <path
        d={`M${x - 22} ${baseY} L${x - 17} ${stumpTop} L${x + 17} ${stumpTop} L${x + 22} ${baseY} Z`}
        fill="var(--trunk)"
      />
      <ellipse cx={x} cy={stumpTop} rx={17} ry={4.5} fill="#b08658" />
      <ellipse cx={x} cy={stumpTop} rx={9} ry={2.2} fill="none" stroke="#8a6a4a" strokeWidth={1.2} />

      {/* Ear tufts, body, and the lighter chest. */}
      <path d={`M${x - 12} ${cy - 16} L${x - 9} ${cy - 25} L${x - 4} ${cy - 17} Z`} fill="#6b4a2e" />
      <path d={`M${x + 12} ${cy - 16} L${x + 9} ${cy - 25} L${x + 4} ${cy - 17} Z`} fill="#6b4a2e" />
      <ellipse cx={x} cy={cy} rx={14} ry={19} fill="#7d5a3a" />
      <ellipse cx={x} cy={cy + 6} rx={8.5} ry={11} fill="#d9bf95" />
      {[-3, 2, 7].map((dy) => (
        <path
          key={dy}
          d={`M${x - 4} ${cy + dy + 6} q2 2 4 0 q2 2 4 0`}
          fill="none"
          stroke="#b0936a"
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}

      {/* The face: two wide eyes turned toward the hiker, and a beak. */}
      <circle cx={x - 5.5} cy={cy - 8} r={5.2} fill="var(--snow)" />
      <circle cx={x + 5.5} cy={cy - 8} r={5.2} fill="var(--snow)" />
      <circle cx={x - 7} cy={cy - 8} r={2.4} fill="#22261f" />
      <circle cx={x + 4} cy={cy - 8} r={2.4} fill="#22261f" />
      <path d={`M${x - 2} ${cy - 4} L${x + 2} ${cy - 4} L${x} ${cy} Z`} fill="#e0a052" />

      {/* A clipboard tucked under the far wing: it's taking notes. */}
      <g transform={`rotate(10 ${x + 15} ${cy + 4})`}>
        <rect x={x + 9} y={cy - 6} width={13} height={17} rx={1.5} fill="#b08658" />
        <rect x={x + 10.5} y={cy - 3.5} width={10} height={13} fill="var(--snow)" />
        {[0, 3.5, 7].map((dy) => (
          <rect key={dy} x={x + 12} y={cy + dy} width={7} height={1.1} fill="#c9cfc0" />
        ))}
        <rect x={x + 13} y={cy - 7.5} width={5} height={3} rx={0.8} fill="#6b4a2e" />
      </g>
      <ellipse cx={x + 11} cy={cy + 3} rx={5} ry={10} fill="#6b4a2e" />
    </g>
  );
}

/** A speech bubble over a speaker's head: the hiker is answering out loud. */
function SpeechBubble({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path
        d={`M${x - 22} ${y - 14} h44 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-30 l-8 8 l1 -8 h-7 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 Z`}
        fill="var(--snow)"
      />
      {[-12, 0, 12].map((dx) => (
        <circle key={dx} cx={x + dx} cy={y + 1} r={2.8} fill="var(--peak-near)" />
      ))}
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
          {/* Contacts: a camp across the trail, pitched on the far meadow. */}
          <g data-scene-part="contacts">
            <Tent x={1010} baseY={304} />
          </g>

          <path
            d="M-20 320 C 200 302 340 334 520 322 C 700 310 900 300 1120 320 C 1280 334 1370 330 1460 312"
            fill="none"
            stroke="#C2A878"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="26 20"
          />

          {/* The board: the hiker mid-trail, feet on the path. */}
          <g data-scene-part="board">
            <Hiker x={752} baseY={316} />
          </g>

          {/* Contacts: two hikers met at a campfire beside the trail. */}
          <g data-scene-part="contacts">
            <Hiker x={694} baseY={342} />
            <Campfire x={760} baseY={342} />
            <Hiker x={826} baseY={342} facing="left" jacket="#4c7a9c" />
          </g>

          {/* Documents: a hiker reading the notices pinned up at the trailhead. */}
          <g data-scene-part="documents">
            <NoticeBoard x={960} baseY={346} />
            <Hiker x={880} baseY={344} />
          </g>

          {/* Interview Simulator: a hiker rehearsing out loud to an owl taking notes on a stump. Still,
              on purpose — nothing at the foot of the page should move while a clock is running. */}
          <g data-scene-part="interview">
            <Hiker x={760} baseY={344} />
            <SpeechBubble x={790} y={262} />
            <OwlInterviewer x={858} baseY={346} />
          </g>
        </>
      )}
    </svg>
  );
}
