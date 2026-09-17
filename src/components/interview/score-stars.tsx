import { Star } from "lucide-react";

import {
  SCORE_BAND_CLASS,
  SCORE_BAND_LABEL,
  STARS_MAX,
  scoreBand,
  starsFor,
  starsLabel,
} from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * A score as five stars in half-steps with its band word beside them (interview second pass ticket
 * 02), wherever the Scorecard shows one: overall, per Category, and per Answer. No number is shown —
 * a bare "62" asks the Tenant to know what 62 means, where "3 stars, solid" already says it.
 *
 * One image to assistive technology, named the way it reads ("3½ of 5 stars, solid"), so the stars
 * are never announced one by one. Coloured by band, as scores were before.
 */
export function ScoreStars({ score, size = "sm", className }: { score: number; size?: "sm" | "lg"; className?: string }) {
  const band = scoreBand(score);
  const stars = starsFor(score);
  const starSize = size === "lg" ? "size-6 sm:size-7" : "size-4";
  return (
    <span
      role="img"
      aria-label={starsLabel(score)}
      className={cn("inline-flex shrink-0 items-center gap-2", SCORE_BAND_CLASS[band], className)}
    >
      <span aria-hidden="true" className="flex">
        {Array.from({ length: STARS_MAX }, (_, index) => (
          <StarMark key={index} fill={Math.min(Math.max(stars - index, 0), 1)} className={starSize} />
        ))}
      </span>
      <span aria-hidden="true" className={cn("font-medium whitespace-nowrap", size === "lg" ? "text-lg" : "text-sm")}>
        {SCORE_BAND_LABEL[band]}
      </span>
    </span>
  );
}

/** One star: an outline, with the band's colour filling all of it, half of it, or none. */
function StarMark({ fill, className }: { fill: number; className: string }) {
  return (
    <span data-star={fill === 1 ? "full" : fill > 0 ? "half" : "empty"} className={cn("relative block", className)}>
      <Star className={cn("text-muted-foreground/45", className)} strokeWidth={1.75} />
      {fill > 0 && (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Star className={cn("max-w-none fill-current", className)} strokeWidth={1.75} />
        </span>
      )}
    </span>
  );
}
