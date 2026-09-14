import { JobBackLink } from "@/components/job/job-back-link";
import { ACTIVE_STAGES, STAGE_META, type Stage } from "@/lib/jobs";
import { SUMMIT } from "@/lib/summit";
import { cn } from "@/lib/utils";

type SummitHeaderFrameProps = {
  stage: Stage | null;
  /** Every Stage's scene (see `SummitScenes`); the page loading in its place has none to draw. */
  scenes?: React.ReactNode;
  /** The Job's name and company, drawn on a frosted panel over the sky. */
  title: React.ReactNode;
  /** Where the attempt has got to, at the start of the strip beneath the picture. */
  progress: React.ReactNode;
  /** The Stage, edit, and posting controls, at the strip's end. */
  controls: React.ReactNode;
};

/**
 * The top of a Job's page: the Stage's scene with the Job's name on its sky, and beneath it one strip
 * with where the attempt has got to and the page's controls. The page and its loading outline both
 * lay out through here, so when the page arrives nothing moves.
 *
 * The scene is pinned to the bottom of the sky at a fixed height, and the sky around it is the scene's
 * own colour, so a title that wraps only makes the sky taller. The title panel overlaps the top of the
 * scene, which is sky in every drawing, only from `lg`, where it holds under half the width: on a
 * narrower screen it would run across the peak in the middle, so it sits just above the picture.
 *
 * In the strip, the controls keep a column of their own from `lg`, and the caption wraps under the
 * steps rather than pushing them onto a second row; below it, the controls take a row beneath.
 */
export function SummitHeaderFrame({ stage, scenes, title, progress, controls }: SummitHeaderFrameProps) {
  const summit = stage ? SUMMIT[stage] : null;

  return (
    // A `div`, not a `header`: the app header above is the page's one banner.
    <div>
      <div
        style={{ backgroundColor: summit?.sky }}
        className="relative overflow-hidden bg-sky [--scene-h:8rem] motion-safe:transition-colors motion-safe:duration-700 sm:[--scene-h:14.5rem] lg:[--scene-h:16.5rem] 2xl:[--scene-h:20rem]"
      >
        <div data-summit={stage ?? undefined} className="absolute inset-x-0 bottom-0 h-(--scene-h)">
          {scenes}
        </div>
        <div className="relative mx-auto w-full max-w-[110rem] px-4 pt-5 pb-[calc(var(--scene-h)*0.9)] sm:px-6 sm:pb-[calc(var(--scene-h)*0.95)] lg:pb-[calc(var(--scene-h)*0.62)]">
          <JobBackLink />
          <div className="flex w-fit max-w-full min-w-0 items-center gap-4 rounded-2xl bg-card/55 px-4 py-3.5 shadow-sm ring-1 ring-white/60 backdrop-blur-md sm:px-5 sm:py-4 lg:max-w-[46%] lg:gap-5 lg:px-6 lg:py-5">
            {title}
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-3 px-4 py-2.5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">{progress}</div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">{controls}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The climb from the map to the summit, with the Job's Stage marked. A rejected Job is off the route,
 * regrouping, so none of the route's steps is its own.
 */
export function SummitProgress({ stage }: { stage: Stage }) {
  const at = ACTIVE_STAGES.indexOf(stage);
  const { phase, line } = SUMMIT[stage];

  return (
    <>
      <ol aria-label="Summit attempt" className="flex flex-wrap items-center gap-1.5 text-xs">
        {ACTIVE_STAGES.map((step, index) => (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn("h-0.5 w-4 rounded sm:w-8", index <= at ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              aria-current={step === stage ? "step" : undefined}
              className={cn(
                "rounded-full px-2 py-0.5 font-bold",
                step === stage
                  ? "bg-primary text-primary-foreground"
                  : index < at
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground",
              )}
            >
              {SUMMIT[step].step}
              <span className="sr-only">, {STAGE_META[step].label}</span>
            </span>
          </li>
        ))}
        {stage === "rejected" && (
          <li aria-current="step" className="ml-2 rounded-full bg-[#efd6bf] px-2 py-0.5 font-bold text-[#6b4a2e]">
            {SUMMIT.rejected.step}
            <span className="sr-only">, {STAGE_META.rejected.label}</span>
          </li>
        )}
      </ol>
      <p className="text-sm">
        <span className="font-heading font-semibold">{phase}.</span>{" "}
        <span className="text-muted-foreground">{line}</span>
      </p>
    </>
  );
}
