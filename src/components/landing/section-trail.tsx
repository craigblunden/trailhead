"use client";

import { useEffect, useRef, useState } from "react";

type Point = [number, number];

/**
 * Landmarks the trail threads through. Each is a `data-trail` value on an
 * element inside the section that renders this component.
 */
export type TrailLandmark = "heading" | "board" | "page" | "cover";

type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * Turns waypoints into one smooth cubic path (Catmull-Rom converted to
 * Béziers), so the trail bends gently instead of cornering at each landmark.
 */
function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  const [first] = points;
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Plots the trail from the section's top edge to its bottom edge through the
 * measured landmarks: down the board's right side, across the gap between
 * rows, down the page panel's left side, then under it to the centre.
 *
 * With a generous margin the rails run just outside the panels, so the trail
 * hugs the content. When the margin is tight the rails move behind the
 * panels instead, and the trail shows only where it crosses the gaps.
 */
function plot(
  section: DOMRect,
  rects: Record<TrailLandmark, Rect>,
): Point[] {
  const { heading, board, page, cover } = rects;
  const width = section.width;
  const height = section.height;
  const margin = board.left;
  const centre = width / 2;

  const headRoom = board.right - heading.right;
  const roomy = headRoom > 200;
  const headX = (t: number) => heading.right + headRoom * t;

  const gapY = (board.bottom + page.top) / 2;
  const gapAmp = (page.top - board.bottom) * 0.35;
  const underTop = Math.max(page.bottom, cover.bottom);
  const underY = (underTop + height) / 2;
  const underAmp = (height - underTop) * 0.3;

  const boardSpan = board.bottom - board.top;
  const pageSpan = page.bottom - page.top;

  // A few broad sweeps rather than many small bends: each arc spans most of
  // a panel's height, swinging out past its edge and back behind it.
  const rail = margin >= 56 ? 34 : -28;

  // Without free space beside the heading the trail would cross the intro
  // text, so it starts behind the board instead.
  const approach: Point[] = roomy
    ? [
        [headX(0.68), -8],
        [headX(0.3), heading.bottom * 0.55],
        [board.right - 40, board.top - 4],
      ]
    : [[centre + 80, board.top + 40]];

  // A wave across the gap needs width to breathe; phones get one gentle
  // pass through the gap's centre instead.
  const crossing: Point[] =
    width < 640
      ? [[centre + 30, gapY]]
      : [
          [board.right - 220, gapY + gapAmp],
          [centre - 40, gapY - gapAmp],
        ];

  return [
    ...approach,
    [board.right + rail, board.top + boardSpan * 0.42],
    ...crossing,
    [page.left - rail, page.top + pageSpan * 0.45],
    [page.left + 180, underY - underAmp],
    [centre + 60, underY + underAmp],
    [centre, height + 8],
  ];
}

/**
 * Decorative dashed trail, in the board scene's style, that weaves through
 * the landing section it sits in. Rendered after mount from measured layout,
 * and re-plotted whenever the section resizes.
 */
export function SectionTrail() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<{ d: string; w: number; h: number }>();

  useEffect(() => {
    const section = svgRef.current?.parentElement;
    if (!section) return;

    const measure = () => {
      const sectionRect = section.getBoundingClientRect();
      const rects = {} as Record<TrailLandmark, Rect>;
      for (const name of ["heading", "board", "page", "cover"] as const) {
        const el = section.querySelector<HTMLElement>(`[data-trail="${name}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        rects[name] = {
          left: r.left - sectionRect.left,
          right: r.right - sectionRect.left,
          top: r.top - sectionRect.top,
          bottom: r.bottom - sectionRect.top,
        };
      }
      setState({
        d: smoothPath(plot(sectionRect, rects)),
        w: sectionRect.width,
        h: sectionRect.height,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      width={state?.w}
      height={state?.h}
      viewBox={state ? `0 0 ${state.w} ${state.h}` : undefined}
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {state && (
        <path
          d={state.d}
          fill="none"
          stroke="var(--trail-path)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray="24 18"
        />
      )}
    </svg>
  );
}
