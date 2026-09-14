/*
 * A Job's page as a summit attempt: one illustrated scene per Stage, in the landscape's flat palette
 * (see `TrailScene`) and with the board's hiker.
 *
 *   interested    studying the map in front of the mountain
 *   applied       pitching base camp
 *   interviewing  roped in on the climb
 *   offer         on a rocky summit above the clouds, contract in hand
 *   rejected      back at camp at dusk, notebook out, planning the next attempt
 *
 * Decorative only: the page always says the Stage in words beside it (see `SummitHeader`). Rendered on
 * the server and handed to the page, so the drawing stays out of the browser's JavaScript.
 */

import { HIKER_FEET, HikerFigure } from "@/components/hiker-mark";
import { Campfire, Mountain, Pine } from "@/components/trail-scene";
import { STAGES, type Stage } from "@/lib/jobs";
import { SUMMIT } from "@/lib/summit";

const SKIN = "#e8b48c";
const INK = "#22261f";
const ROCK = "#8f99a4";
const ROCK_LIGHT = "#aab3bc";
const BLUE_JACKET = "#4c7a9c";

/**
 * How far the ground-level scenes raise their foreground above the bottom of the picture. Their
 * people stand almost on its bottom edge, right against the strip beneath; the mountains and sky stay
 * where they are, so nothing at the top is cropped.
 */
const GROUND_LIFT = 32;

type FigureProps = {
  x: number;
  baseY: number;
  scale?: number;
  facing?: "left" | "right";
  rotate?: number;
  jacket?: string;
  /** Extra drawing in the figure's own 64-unit coordinates, on top of the hiker. */
  children?: React.ReactNode;
};

/** The board's hiker, placed by their feet, with room for props in their own coordinates. */
function Figure({ x, baseY, scale = 2.2, facing = "right", rotate = 0, jacket, children }: FigureProps) {
  const sx = facing === "right" ? scale : -scale;
  return (
    <g
      transform={`translate(${x} ${baseY}) rotate(${rotate}) scale(${sx} ${scale}) translate(${-HIKER_FEET.x} ${-HIKER_FEET.y})`}
    >
      <HikerFigure jacket={jacket} />
      {children}
    </g>
  );
}

function Cloud({ x, y, s = 1, fill = "#ffffff" }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g fill={fill}>
      <circle cx={x - 30 * s} cy={y} r={20 * s} />
      <circle cx={x} cy={y - 12 * s} r={28 * s} />
      <circle cx={x + 30 * s} cy={y - 2 * s} r={22 * s} />
      <rect x={x - 50 * s} y={y} width={104 * s} height={18 * s} rx={9 * s} />
    </g>
  );
}

function CampTent({
  x,
  baseY,
  s = 1,
  light = "#e0a052",
  dark = "#c9803a",
}: {
  x: number;
  baseY: number;
  s?: number;
  light?: string;
  dark?: string;
}) {
  return (
    <g>
      <path d={`M${x - 36 * s} ${baseY} L${x} ${baseY - 44 * s} L${x} ${baseY} Z`} fill={light} />
      <path d={`M${x} ${baseY - 44 * s} L${x + 36 * s} ${baseY} L${x} ${baseY} Z`} fill={dark} />
      <path d={`M${x - 9 * s} ${baseY} L${x} ${baseY - 26 * s} L${x + 9 * s} ${baseY} Z`} fill="#6b4a2e" />
    </g>
  );
}

function Rocks({ at }: { at: [number, number, number][] }) {
  return (
    <g>
      {at.map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.62} fill="#9aa39a" />
          <ellipse cx={x - r * 0.25} cy={y - r * 0.2} rx={r * 0.45} ry={r * 0.25} fill="#b4bbb2" />
        </g>
      ))}
    </g>
  );
}

function Backpack({ x, baseY, s = 1 }: { x: number; baseY: number; s?: number }) {
  return (
    <g>
      <rect x={x - 13 * s} y={baseY - 34 * s} width={26 * s} height={34 * s} rx={7 * s} fill="#46584c" />
      <rect x={x - 9 * s} y={baseY - 18 * s} width={18 * s} height={12 * s} rx={3 * s} fill="#3a4a40" />
      <path
        d={`M${x - 13 * s} ${baseY - 30 * s} h${26 * s}`}
        stroke="#d1603f"
        strokeWidth={3 * s}
        strokeLinecap="round"
      />
    </g>
  );
}

function RopeCoil({ x, y, r = 11 }: { x: number; y: number; r?: number }) {
  return (
    <g fill="none" stroke="var(--trail-path)" strokeWidth={3}>
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.55} />
      <ellipse cx={x} cy={y - 3} rx={r * 0.75} ry={r * 0.4} />
    </g>
  );
}

function Pennant({ x, y, h = 34, fill = "var(--hiker)" }: { x: number; y: number; h?: number; fill?: string }) {
  return (
    <g>
      <rect x={x - 1.5} y={y - h} width={3} height={h} fill="var(--trunk)" />
      <path d={`M${x + 1.5} ${y - h} L${x + 1.5 + h * 0.6} ${y - h + h * 0.2} L${x + 1.5} ${y - h + h * 0.4} Z`} fill={fill} />
    </g>
  );
}

function Star({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  return (
    <path
      d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`}
      fill="#fffaf0"
    />
  );
}

/** A folded trail map, held up in the hiker's hands (figure coordinates). */
function HeldMap() {
  return (
    <g transform="rotate(-8 53 31)">
      <rect x={38} y={20} width={10} height={23} fill="#f4ecd2" stroke="#8a6a4a" strokeWidth={0.6} />
      <rect x={48} y={20} width={10} height={23} fill="#e6dab6" stroke="#8a6a4a" strokeWidth={0.6} />
      <rect x={58} y={20} width={10} height={23} fill="#f4ecd2" stroke="#8a6a4a" strokeWidth={0.6} />
      <path d="M41 38 C 46 34 50 40 56 35 S 64 33 66 29" fill="none" stroke="#7fa6c8" strokeWidth={1.2} />
      <path d="M52 31 L57 24 L62 31 Z" fill="var(--peak-near)" />
      <path d="M57 24 L58.4 26 L57 25.5 L55.6 26 Z" fill="var(--snow)" />
      <path d="M42 41 L48 36 L53 33 L57 25" fill="none" stroke="#d1603f" strokeWidth={0.9} strokeDasharray="1.6 1.2" />
      <circle cx={38.5} cy={32} r={2.1} fill={SKIN} />
      <circle cx={67.5} cy={30} r={2.1} fill={SKIN} />
    </g>
  );
}

/**
 * A signed contract held up in the raised hand (figure coordinates): the paper, signature, and wax seal
 * of the one pinned to the board's finish marker (see `StageMarker`).
 */
function HeldContract() {
  return (
    <g transform="translate(40.5 13) scale(1.35) rotate(8) translate(-40.5 -13)">
      <path d="M35 -5 H45.5 L49 -1.5 V14 H35 Z" fill="var(--snow)" stroke="#c9cfc0" strokeWidth={0.6} strokeLinejoin="round" />
      <path d="M45.5 -5 V-1.5 H49 Z" fill="#dfe3d8" />
      <rect x={37} y={-2} width={6.5} height={1.3} fill="#6b4a2e" />
      <rect x={37} y={1.2} width={10} height={0.8} fill="#b7bdae" />
      <rect x={37} y={3.4} width={8} height={0.8} fill="#b7bdae" />
      <path d="M37 10 C 37.8 8 38.8 8 38.8 9.6 S 40.3 11.2 41 9 S 42.2 9.4 43 10.2" fill="none" stroke="#4c7a9c" strokeWidth={0.7} strokeLinecap="round" />
      <circle cx={46} cy={10.2} r={2} fill="var(--hiker)" />
      <circle cx={46} cy={10.2} r={0.9} fill="#d1603f" />
    </g>
  );
}

/** A hiker sitting on a log, reading a notebook. Drawn in scene units around the seat. */
function SittingReader({ x, seatY, s = 2.2 }: { x: number; seatY: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${seatY}) scale(${s})`}>
      <rect x={-14} y={-16} width={9} height={15} rx={2.5} fill="#46584c" />
      <path d="M1 -1.5 L16 -1.5 L17 12" fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-6 0 L-4.4 -12.6 a2.5 2.5 0 0 1 2.5 -2.4 h6 a2.5 2.5 0 0 1 2.5 2.4 L8 0 Z" fill="#d1603f" />
      <circle cx={2.5} cy={-20.5} r={5.6} fill={SKIN} />
      <g transform="rotate(-18 13 -10)">
        <rect x={8} y={-15} width={5} height={8} fill="#f8fafc" stroke="#8a6a4a" strokeWidth={0.5} />
        <rect x={13} y={-15} width={5} height={8} fill="#eef1ea" stroke="#8a6a4a" strokeWidth={0.5} />
        {[-13, -11, -9].map((ly) => (
          <path key={ly} d={`M9 ${ly} h3 M14 ${ly} h3`} stroke="#b7bdae" strokeWidth={0.6} />
        ))}
      </g>
      <path d="M4 -11.5 L10.5 -8" stroke="#d1603f" strokeWidth={3.4} strokeLinecap="round" />
      <circle cx={11} cy={-8} r={2} fill={SKIN} />
    </g>
  );
}

function InterestedScene() {
  return (
    <>
      <rect x={-1000} width={3200} height={400} fill={SUMMIT.interested.sky} />
      <circle cx={1010} cy={110} r={46} fill="var(--sun)" />
      <Cloud x={230} y={96} s={0.9} />
      <Cloud x={890} y={70} s={0.7} />

      <Mountain apexX={380} apexY={150} baseY={330} halfWidth={230} fill="var(--peak-far)" />
      <Mountain apexX={1070} apexY={170} baseY={330} halfWidth={210} fill="var(--peak-far)" />
      <Mountain apexX={-600} apexY={140} baseY={330} halfWidth={260} fill="var(--peak-far)" />
      <Mountain apexX={1880} apexY={170} baseY={330} halfWidth={240} fill="var(--peak-far)" />
      <Mountain apexX={-120} apexY={170} baseY={330} halfWidth={220} fill="var(--peak-far)" />
      <Mountain apexX={1420} apexY={150} baseY={330} halfWidth={240} fill="var(--peak-far)" />
      <Mountain apexX={760} apexY={50} baseY={330} halfWidth={330} fill="var(--peak-near)" />

      {/* The route the map shows, traced faintly on the real mountain. */}
      <path
        d="M690 294 L830 262 L700 202 L800 142 L748 96 L760 58"
        fill="none"
        stroke="#d1603f"
        strokeOpacity={0.75}
        strokeWidth={4}
        strokeDasharray="10 9"
        strokeLinecap="round"
      />
      <Pennant x={760} y={52} h={30} />

      {/* The ground and everything on it, lifted clear of the strip beneath the picture. */}
      <g transform={`translate(0 ${-GROUND_LIFT})`}>
        <path d="M-1000 318 C -800 304 -600 326 -400 318 C -260 300 -130 316 0 312 C 200 290 380 306 600 298 C 820 290 1000 296 1200 306 C 1340 314 1470 296 1600 306 C 1800 316 2000 298 2200 306 L2200 440 L-1000 440 Z" fill="var(--hill-far)" />
        <path d="M-1000 356 C -800 342 -600 364 -400 356 C -260 338 -130 354 0 350 C 240 330 460 344 700 336 C 900 330 1060 332 1200 342 C 1340 350 1470 332 1600 342 C 1800 352 2000 334 2200 342 L2200 440 L-1000 440 Z" fill="var(--hill-near)" />

        <path
          d="M300 386 C 460 366 560 350 690 326"
          fill="none"
          stroke="var(--trail-path)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray="22 16"
        />

        <Pine x={-760} baseY={336} height={86} fill="var(--pine-dark)" />
        <Pine x={-520} baseY={350} height={58} fill="var(--pine)" />
        <Pine x={1700} baseY={346} height={60} fill="var(--pine)" />
        <Pine x={1960} baseY={334} height={92} fill="var(--pine-dark)" />
        <Pine x={-260} baseY={332} height={90} fill="var(--pine-dark)" />
        <Pine x={-150} baseY={350} height={60} fill="var(--pine)" />
        <Pine x={1330} baseY={344} height={58} fill="var(--pine)" />
        <Pine x={1450} baseY={330} height={94} fill="var(--pine-dark)" />
        <Pine x={70} baseY={336} height={96} fill="var(--pine-dark)" />
        <Pine x={140} baseY={352} height={62} fill="var(--pine)" />
        <Pine x={1110} baseY={330} height={92} fill="var(--pine-dark)" />
        <Pine x={1165} baseY={350} height={60} fill="var(--pine)" />
        <Pine x={990} baseY={340} height={54} fill="var(--pine)" />

        {/* Trailhead sign, pointing up the route. */}
        <g>
          <rect x={462} y={318} width={6} height={50} fill="var(--trunk)" />
          <path d="M440 322 H500 L510 332 L500 342 H440 Z" fill="#b08658" stroke="var(--trunk)" strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M448 339 L456 327 L464 339 Z" fill="var(--peak-near)" />
          <rect x={470} y={329} width={22} height={2.4} fill="#6b4a2e" />
          <rect x={470} y={334} width={14} height={2.4} fill="#6b4a2e" />
        </g>

        <Rocks at={[[380, 382, 14], [560, 376, 9]]} />
        <Figure x={250} baseY={384} scale={2.5}>
          <HeldMap />
        </Figure>
      </g>
    </>
  );
}

function AppliedScene() {
  return (
    <>
      <rect x={-1000} width={3200} height={400} fill={SUMMIT.applied.sky} />
      <Mountain apexX={260} apexY={120} baseY={310} halfWidth={260} fill="var(--peak-far)" />
      <Mountain apexX={-560} apexY={130} baseY={310} halfWidth={280} fill="var(--peak-far)" />
      <Mountain apexX={1480} apexY={110} baseY={310} halfWidth={280} fill="var(--peak-far)" />
      <Mountain apexX={830} apexY={30} baseY={310} halfWidth={430} fill="var(--peak-near)" />
      <Cloud x={690} y={196} s={1.2} />
      <Cloud x={1000} y={170} s={0.9} />
      <Cloud x={180} y={210} s={0.7} />

      {/* The ground and everything on it, lifted clear of the strip beneath the picture. */}
      <g transform={`translate(0 ${-GROUND_LIFT})`}>
        <path d="M-1000 306 C -800 292 -600 314 -400 306 C -260 288 -130 304 0 300 C 220 284 420 296 640 290 C 860 284 1020 292 1200 300 C 1340 308 1470 290 1600 300 C 1800 310 2000 292 2200 300 L2200 440 L-1000 440 Z" fill="var(--hill-far)" />
        <path d="M-1000 352 C -800 338 -600 360 -400 352 C -260 334 -130 350 0 346 C 260 330 480 342 720 336 C 940 330 1080 334 1200 340 C 1340 348 1470 330 1600 340 C 1800 350 2000 332 2200 340 L2200 440 L-1000 440 Z" fill="var(--hill-near)" />

        <Pine x={-820} baseY={334} height={86} fill="var(--pine-dark)" />
        <Pine x={-640} baseY={348} height={56} fill="var(--pine)" />
        <Pine x={1760} baseY={346} height={58} fill="var(--pine)" />
        <Pine x={1980} baseY={332} height={90} fill="var(--pine-dark)" />
        <Pine x={-300} baseY={332} height={88} fill="var(--pine-dark)" />
        <Pine x={-200} baseY={348} height={56} fill="var(--pine)" />
        <Pine x={1300} baseY={346} height={58} fill="var(--pine)" />
        <Pine x={1420} baseY={330} height={92} fill="var(--pine-dark)" />
        <Pine x={60} baseY={330} height={90} fill="var(--pine-dark)" />
        <Pine x={128} baseY={346} height={58} fill="var(--pine)" />
        <Pine x={1120} baseY={328} height={86} fill="var(--pine-dark)" />
        <Pine x={1060} baseY={346} height={54} fill="var(--pine)" />

        {/* A tent going up: pole standing, fly still slack, a guy line in the hiker's hand. */}
        <g>
          <path d="M232 370 L300 306 L318 330 Q340 352 368 370 Z" fill="#6f9cc0" />
          <path d="M300 306 L318 330 Q340 352 368 370 L300 370 Z" fill={BLUE_JACKET} />
          <rect x={298} y={304} width={4} height={66} fill="#3b4652" />
          <path d="M300 306 L394 330" stroke="#3b3b3b" strokeWidth={1.6} />
        </g>
        <Figure x={430} baseY={372} scale={2.3} facing="left" />

        <CampTent x={600} baseY={364} s={1.9} />
        <Pennant x={700} y={362} h={120} />
        <Campfire x={820} baseY={372} />
        <Backpack x={500} baseY={372} s={0.9} />
        <RopeCoil x={536} y={368} />
        <Rocks at={[[940, 380, 16], [980, 386, 10], [180, 384, 12]]} />
      </g>
    </>
  );
}

function InterviewingScene() {
  return (
    <>
      <rect x={-1000} width={3200} height={400} fill={SUMMIT.interviewing.sky} />
      <circle cx={260} cy={90} r={40} fill="var(--sun)" />
      <path d="M140 150 l10 8 l10 -8 M180 132 l8 6 l8 -6" fill="none" stroke="#4c5b6b" strokeWidth={2.4} strokeLinecap="round" />

      {/* Far peaks poking through the cloud below. */}
      <Mountain apexX={-620} apexY={260} baseY={400} halfWidth={180} fill="var(--peak-far)" />
      <Cloud x={-700} y={346} s={1.6} />
      <Mountain apexX={-160} apexY={270} baseY={400} halfWidth={170} fill="var(--peak-far)" />
      <Cloud x={-220} y={350} s={1.6} />
      <Mountain apexX={150} apexY={250} baseY={400} halfWidth={170} fill="var(--peak-far)" />
      <Mountain apexX={420} apexY={290} baseY={400} halfWidth={140} fill="var(--peak-far)" />
      <Cloud x={90} y={342} s={1.5} />
      <Cloud x={320} y={360} s={1.7} />
      <Cloud x={560} y={378} s={1.3} />
      <rect x={-1000} y={362} width={1640} height={38} fill="#ffffff" />

      {/* The face being climbed. */}
      <path d="M360 400 L560 300 L650 262 L760 196 L830 150 L900 92 L1000 34 L1200 18 L1600 8 L2200 0 L2200 400 Z" fill={ROCK} />
      <path d="M560 300 L650 262 L760 196 L700 400 L460 400 Z" fill={ROCK_LIGHT} />
      <path d="M830 150 L900 92 L1000 34 L960 400 L860 400 Z" fill={ROCK_LIGHT} />
      <path d="M900 92 L1000 34 L1200 18 L1600 8 L2200 0 L2200 46 L1600 52 L1110 58 L1060 76 L1010 70 L960 96 Z" fill="var(--snow)" />
      <path d="M620 330 l30 -10 l18 12 l-26 8 Z M1040 220 l40 -14 l20 16 l-44 10 Z M880 300 l26 -8 l14 10 Z" fill="#7a848f" />

      {/* The route up, and a pennant at each pitch cleared. */}
      <path
        d="M470 392 L600 318 L700 272 L800 214 L880 158 L960 96"
        fill="none"
        stroke="var(--trail-path)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="14 10"
      />
      <Pennant x={600} y={318} h={36} fill="var(--sun)" />
      <Pennant x={700} y={272} h={36} fill="var(--sun)" />

      {/* A rope team: the second belays from below, the leader moves up. */}
      <path d="M680 250 Q 760 250 802 180" fill="none" stroke="#d1603f" strokeWidth={2.6} />
      <Figure x={700} baseY={274} scale={2.1} rotate={-22} jacket={BLUE_JACKET} />
      <Figure x={820} baseY={208} scale={2.2} rotate={-30}>
        <path d="M37 21.5 L44 20 L43.2 23.4 Z" fill="#3b4652" />
      </Figure>
    </>
  );
}

function OfferScene() {
  const scallops = Array.from({ length: 51 }, (_, i) => i - 16);
  return (
    <>
      <rect x={-1000} width={3200} height={400} fill={SUMMIT.offer.sky} />
      <rect x={-1000} y={170} width={3200} height={140} fill="#cfe2f1" />
      <circle cx={930} cy={120} r={96} fill="#fdf3cf" opacity={0.55} />
      <circle cx={930} cy={120} r={60} fill="var(--sun)" />

      <Mountain apexX={170} apexY={190} baseY={330} halfWidth={170} fill="var(--peak-far)" />
      <Mountain apexX={1060} apexY={180} baseY={330} halfWidth={160} fill="var(--peak-mid)" />
      <Mountain apexX={1180} apexY={236} baseY={330} halfWidth={110} fill="var(--peak-far)" />
      <Mountain apexX={-640} apexY={180} baseY={330} halfWidth={180} fill="var(--peak-mid)" />
      <Mountain apexX={1840} apexY={200} baseY={330} halfWidth={170} fill="var(--peak-far)" />
      <Mountain apexX={-220} apexY={210} baseY={330} halfWidth={160} fill="var(--peak-far)" />
      <Mountain apexX={1420} apexY={200} baseY={330} halfWidth={150} fill="var(--peak-mid)" />

      {/* The sea of cloud. */}
      <g fill="#e4edf5">
        {scallops.map((i) => (
          <circle key={`s${i}`} cx={i * 68 - 10} cy={300 + (i % 2) * 10} r={42 + (i % 3) * 6} />
        ))}
      </g>
      <g fill="#f8fafc">
        {scallops.map((i) => (
          <circle key={`w${i}`} cx={i * 68 + 24} cy={322 + ((i + 1) % 2) * 8} r={40 + ((i + 1) % 3) * 6} />
        ))}
        <rect x={-1000} y={330} width={3200} height={70} />
      </g>

      {/* The summit block. */}
      <path d="M340 400 L430 300 L480 312 L545 222 L585 230 L620 172 L690 172 L730 232 L770 226 L850 330 L900 400 Z" fill={ROCK} />
      <path d="M340 400 L430 300 L480 312 L545 222 L585 230 L620 172 L650 172 L610 400 Z" fill={ROCK_LIGHT} />
      <path d="M620 172 L690 172 L712 204 L690 196 L672 210 L652 194 L632 206 L612 186 Z" fill="var(--snow)" />
      <path d="M470 350 l36 -12 l20 14 l-34 10 Z M700 300 l30 -8 l16 12 l-30 8 Z" fill="#7a848f" />
      <g fill="#f8fafc">
        <circle cx={330} cy={392} r={40} />
        <circle cx={400} cy={404} r={36} />
        <circle cx={880} cy={396} r={44} />
        <circle cx={800} cy={410} r={34} />
        <circle cx={480} cy={414} r={36} />
        <circle cx={560} cy={420} r={34} />
        <circle cx={640} cy={410} r={40} />
        <circle cx={720} cy={418} r={36} />
      </g>

      {/* A flag planted, a cairn built, and the contract held up high. */}
      <rect x={624} y={64} width={5} height={110} fill="var(--trunk)" />
      <path d="M624 66 L552 84 L624 102 Z" fill="var(--hiker)" />
      <path d="M592 94 L604 78 L616 94 Z" fill="var(--snow)" opacity={0.9} />
      <g>
        <ellipse cx={704} cy={170} rx={14} ry={5} fill="#858e85" />
        <ellipse cx={703} cy={162} rx={10} ry={4} fill="#9aa39a" />
        <ellipse cx={704} cy={155} rx={6} ry={3} fill="#858e85" />
      </g>
      <Figure x={660} baseY={174} scale={2.3}>
        <path d="M34 26.5 L40.5 13.5" stroke="#d1603f" strokeWidth={3.4} strokeLinecap="round" />
        <HeldContract />
        <circle cx={40.5} cy={13} r={2.1} fill={SKIN} />
      </Figure>
    </>
  );
}

function RejectedScene() {
  return (
    <>
      <rect x={-1000} width={3200} height={400} fill="#efd6bf" />
      <rect x={-1000} width={3200} height={140} fill={SUMMIT.rejected.sky} />
      <rect x={-1000} y={140} width={3200} height={50} fill="#e6ccc6" />
      <Star x={140} y={54} />
      <Star x={330} y={96} r={4} />
      <Star x={1080} y={62} r={4} />
      <circle cx={1010} cy={318} r={64} fill="#f0a868" />

      <Mountain apexX={-640} apexY={150} baseY={320} halfWidth={260} fill="#a9a3c3" />
      <Mountain apexX={1900} apexY={180} baseY={320} halfWidth={240} fill="#a9a3c3" />
      <Mountain apexX={-150} apexY={180} baseY={320} halfWidth={220} fill="#a9a3c3" />
      <Mountain apexX={1400} apexY={160} baseY={320} halfWidth={240} fill="#a9a3c3" />
      <Mountain apexX={700} apexY={70} baseY={320} halfWidth={320} fill="#8e8cb2" />
      <Mountain apexX={260} apexY={170} baseY={320} halfWidth={220} fill="#a9a3c3" />

      {/* How far this attempt got, and the line still to try. */}
      <path d="M610 316 L700 262 L640 210 L690 172" fill="none" stroke="#d1603f" strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />
      <path d="M682 164 l16 16 M698 164 l-16 16" stroke="#d1603f" strokeWidth={4} strokeLinecap="round" />
      <path d="M690 172 L740 124 L700 70" fill="none" stroke="#ffffff" strokeWidth={4} strokeDasharray="2 10" strokeLinecap="round" />

      <path d="M-1000 312 C -800 298 -600 320 -400 312 C -260 294 -130 310 0 306 C 220 290 420 300 640 296 C 860 292 1020 298 1200 306 C 1340 314 1470 296 1600 306 C 1800 316 2000 298 2200 306 L2200 400 L-1000 400 Z" fill="#94ac80" />
      <path d="M-1000 356 C -800 342 -600 364 -400 356 C -260 338 -130 354 0 350 C 260 334 480 344 720 338 C 940 332 1080 338 1200 344 C 1340 352 1470 334 1600 344 C 1800 354 2000 336 2200 344 L2200 400 L-1000 400 Z" fill="#7f9b6f" />

      <Pine x={-780} baseY={334} height={90} fill="var(--pine-dark)" />
      <Pine x={-560} baseY={350} height={56} fill="var(--pine)" />
      <Pine x={1760} baseY={348} height={58} fill="var(--pine)" />
      <Pine x={1960} baseY={336} height={88} fill="var(--pine-dark)" />
      <Pine x={-250} baseY={336} height={88} fill="var(--pine-dark)" />
      <Pine x={-160} baseY={350} height={56} fill="var(--pine)" />
      <Pine x={1400} baseY={334} height={90} fill="var(--pine-dark)" />
      <Pine x={70} baseY={334} height={92} fill="var(--pine-dark)" />
      <Pine x={1130} baseY={336} height={88} fill="var(--pine-dark)" />
      <Pine x={1070} baseY={350} height={56} fill="var(--pine)" />

      <ellipse cx={600} cy={366} rx={110} ry={40} fill="#ffd28a" opacity={0.35} />
      <CampTent x={320} baseY={368} s={1.8} />
      <Campfire x={600} baseY={376} />
      <rect x={456} y={362} width={80} height={16} rx={8} fill="var(--trunk)" />
      <circle cx={464} cy={370} r={6} fill="#b08658" />
      <SittingReader x={494} seatY={362} />

      {/* Kit laid out and repacked for next time. */}
      <Backpack x={740} baseY={382} />
      <RopeCoil x={782} y={378} />
      <g>
        <rect x={866} y={326} width={6} height={56} fill="var(--trunk)" />
        <path d="M846 330 H900 L910 340 L900 350 H846 Z" fill="#b08658" stroke="var(--trunk)" strokeWidth={2.5} strokeLinejoin="round" transform="rotate(-18 869 340)" />
      </g>
    </>
  );
}

const SCENES: Record<Stage, () => React.ReactNode> = {
  interested: InterestedScene,
  applied: AppliedScene,
  interviewing: InterviewingScene,
  offer: OfferScene,
  rejected: RejectedScene,
};

function SummitScene({ stage }: { stage: Stage }) {
  const Scene = SCENES[stage];
  return (
    <svg
      viewBox="-1000 0 3200 400"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      data-summit-part={stage}
      className="absolute inset-0 block size-full"
    >
      <Scene />
    </svg>
  );
}

/**
 * Every Stage's scene, stacked, for a container that says which to show with `data-summit`; changing
 * Stage crossfades from one to the next (see `[data-summit-part]` in `globals.css`).
 *
 * Each fills its container from the bottom edge. The view box is 3200 × 400: the picture is drawn in
 * the middle 1200, with sky and meadow running on 1000 further each side, so a wide, short banner
 * shows more landscape rather than cropping the sky, and a narrow one crops only the edges.
 */
export function SummitScenes() {
  return (
    <>
      {STAGES.map((stage) => (
        <SummitScene key={stage} stage={stage} />
      ))}
    </>
  );
}
