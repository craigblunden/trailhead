"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { Compass, TriangleAlert } from "lucide-react";

import { footingClient } from "@/components/job/footing-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FOOTING_DIMENSION_BLURB,
  FOOTING_DIMENSION_LABEL,
  OVERALL_DIMENSIONS,
  OVERALL_UNCLEAR_LINE,
  UNCLEAR_LABEL,
  comparisonFor,
  dimensionOf,
  isOverallUnclear,
  isUnclear,
  overallBand,
  staleLine,
  type Footing,
  type FootingDimension,
  type FootingDimensionScore,
  type FootingPanel,
} from "@/lib/footing";
import { footingCache } from "@/lib/footing-cache";
import { SHORT_DESCRIPTION_CHARS } from "@/lib/generation";
import { NOT_READY_LABEL, SCORE_BAND_CLASS, SCORE_BAND_LABEL, readinessOf, scoreBand } from "@/lib/interview";
import { formatLongDate, type Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/**
 * A Job's **Footing** (footing tickets 04, 05): how securely the Tenant stands against this one Job.
 * The overall band beside the Application kit, the four dimensions that make it up, what changed
 * since last time, and the earlier ones as a short list.
 *
 * Three rules this file keeps, and they are the feature:
 *
 * - **No number is ever rendered.** Not a percentage, not a "64", and not a bar that reads as one.
 *   Band words and the Scorecard's own `SCORE_BAND_CLASS` colours, and nothing else — so colour is
 *   never the only carrier of the band either.
 * - **It is shown on the job page only.** Nothing here touches the board, its list query, its
 *   provider, or its cache. Thirty cards each wearing a band word would turn the board into a
 *   ranking, and a column of "Not there yet" is the demoralising version of this feature.
 * - **Never automatic.** One control, pressed by the Tenant. A stale Footing is shown with a line
 *   saying what moved, and is never silently recomputed.
 */

/** What both halves of the feature read: the panel query, and the scoring that writes into it. */
export function useFooting(jobId: string) {
  const queryClient = useQueryClient();
  const panel = useQuery(footingCache.options(jobId, footingClient.panel));

  const score = useMutation({
    mutationFn: () => footingClient.score(jobId),
    onSuccess: (result) => {
      if (!result.ok) return;
      // The server already stored it; the cache is told the same rather than refetching. The newest
      // becomes the head of the history, and what it replaced becomes the first of the earlier ones.
      queryClient.setQueryData<FootingPanel>(footingCache.key(jobId), (current) => ({
        available: current?.available ?? true,
        newest: result.footing,
        earlier: current?.newest ? [current.newest, ...current.earlier] : [],
      }));
    },
  });

  const failure = score.data && !score.data.ok ? score.data.message : score.isError ? FALLBACK : null;
  return { panel, score, failure };
}

const FALLBACK = "Something went wrong on our side. Nothing was saved — try again.";

/** The card beside the Application kit. The Letter dimension is not here; it sits beside the letter. */
export function FootingCard({ job }: { job: Job }) {
  const headingId = useId();
  const { panel, score, failure } = useFooting(job.id);
  const readiness = readinessOf(job);
  const newest = panel.data?.newest ?? null;
  const previous = panel.data?.earlier[0] ?? null;

  // No key configured: the feature is unavailable, not broken, so there is no control at all rather
  // than one that would only ever refuse.
  if (panel.data && !panel.data.available && !newest) return null;

  return (
    <Card role="region" aria-labelledby={headingId} className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id={headingId}>Your footing</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {panel.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking your footing…
          </p>
        ) : panel.isError ? (
          <div role="alert" className="text-sm">
            <p>We couldn’t load your footing on this job.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void panel.refetch()}>
              Try again
            </Button>
          </div>
        ) : newest ? (
          <FootingReading footing={newest} previous={previous} />
        ) : (
          <p className="text-sm text-muted-foreground">
            See how your resume reads against this posting — where you’re strongest, and where to look
            first. It doesn’t rewrite anything.
          </p>
        )}

        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}

        {panel.data?.available !== false && (
          <ScoreControl
            readiness={readiness}
            short={job.description.trim().length < SHORT_DESCRIPTION_CHARS}
            scoring={score.isPending}
            existing={Boolean(newest)}
            stale={Boolean(newest && newest.changed.length > 0)}
            onScore={() => score.mutate()}
          />
        )}

        {panel.data && panel.data.earlier.length > 0 && <EarlierFootings earlier={panel.data.earlier} />}
      </CardContent>
    </Card>
  );
}

/** The overall band, what changed since last time, and the four dimensions under it. */
function FootingReading({ footing, previous }: { footing: Footing; previous: Footing | null }) {
  const band = overallBand(footing);
  const comparison = comparisonFor(footing, previous);
  const unclear = isOverallUnclear(footing);
  const stale = staleLine(footing.changed);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Overall</span>
        {band && <BandWord band={band} className="text-lg" label="Overall footing" />}
      </div>

      {comparison && <p className="text-sm">{comparison}</p>}

      {stale && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{stale} Score it again for a fresh reading.</span>
        </p>
      )}

      {/* Said once, above the breakdown, rather than five times inside it. */}
      {unclear && <p className="text-sm text-muted-foreground">{OVERALL_UNCLEAR_LINE}</p>}

      <dl className="space-y-3 border-t border-border pt-4">
        {OVERALL_DIMENSIONS.map((dimension) => (
          <DimensionRow
            key={dimension}
            dimension={dimension}
            scored={dimensionOf(footing, dimension)}
            // When the whole reading is shaky it is already said above; marking each row as well is
            // noise rather than honesty.
            markUnclear={!unclear}
          />
        ))}
      </dl>

      <p className="text-xs text-muted-foreground">
        Scored {formatLongDate(footing.scoredAt.slice(0, 10))}. It says where to look, not what to
        write.
      </p>
    </div>
  );
}

/** One dimension: its name, what it asks, and its band. Nothing numeric. */
function DimensionRow({
  dimension,
  scored,
  markUnclear,
}: {
  dimension: FootingDimension;
  scored: FootingDimensionScore | null;
  markUnclear: boolean;
}) {
  if (!scored) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="min-w-0">
        <span className="font-medium">{FOOTING_DIMENSION_LABEL[dimension]}</span>
        <span className="block text-xs text-muted-foreground">{FOOTING_DIMENSION_BLURB[dimension]}</span>
      </dt>
      <dd className="flex items-baseline gap-2">
        {markUnclear && isUnclear(scored) && (
          <span className="text-xs text-muted-foreground">{UNCLEAR_LABEL}</span>
        )}
        <BandWord band={scoreBand(scored.score)} label={FOOTING_DIMENSION_LABEL[dimension]} />
      </dd>
    </div>
  );
}

/**
 * A band word, coloured by band. Assistive technology hears the dimension and the band together, in
 * the spirit of `starsLabel()`, so the colour is never the only thing carrying the meaning.
 */
export function BandWord({
  band,
  label,
  className,
}: {
  band: ReturnType<typeof scoreBand>;
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${SCORE_BAND_LABEL[band].toLowerCase()}`}
      className={cn("font-medium whitespace-nowrap", SCORE_BAND_CLASS[band], className)}
    >
      <span aria-hidden="true">{SCORE_BAND_LABEL[band]}</span>
    </span>
  );
}

/**
 * The one control. Disabled with the readiness vocabulary's own words when the Job has no posting or
 * no resume — a two-line description is the real cause of a low score, and there is no point paying
 * to find that out.
 */
function ScoreControl({
  readiness,
  short,
  scoring,
  existing,
  stale,
  onScore,
}: {
  readiness: ReturnType<typeof readinessOf>;
  /** The posting is there, but barely: the same threshold the cover letter warns at. */
  short: boolean;
  scoring: boolean;
  existing: boolean;
  stale: boolean;
  onScore: () => void;
}) {
  const ready = readiness === "ready";
  return (
    <div className="border-t border-border pt-4">
      <Button
        type="button"
        variant={existing ? "outline" : "default"}
        className="h-9 px-3.5"
        disabled={!ready || scoring}
        onClick={onScore}
      >
        <Compass aria-hidden="true" />
        {scoring ? "Checking…" : stale ? "Score it again" : existing ? "Score again" : "Check my footing"}
      </Button>
      {!ready && <p className="mt-2 text-sm text-muted-foreground">{NOT_READY_LABEL[readiness]}</p>}
      {/* Advice, never a third refusal: `readinessOf()` owns what is refused, and a short posting is
          still worth scoring. But it is the real cause of a reading that isn't clear-cut, so it is
          worth saying before the Tenant spends the wait — the same line the cover letter gives. */}
      {ready && short && (
        <p className="mt-2 text-sm text-muted-foreground">
          Short descriptions make for a rough reading. Paste the whole posting into the job
          description for a sharper one.
        </p>
      )}
    </div>
  );
}

/**
 * The earlier Footings (footing ticket 05): a short list, newest first, each with its date, its
 * overall band, and the bands it recorded on the four. Not a chart and not a trend line — what it is
 * for is seeing whether a rewritten resume actually scored better on the dimension that was weakest,
 * which is a handful of words and a date.
 *
 * Read through today's weights, like every other overall here, so tuning them re-reads the history
 * correctly rather than leaving old rows speaking an older formula.
 */
function EarlierFootings({ earlier }: { earlier: Footing[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="border-t border-border pt-4">
      <h3 id={headingId} className="font-sans text-sm font-bold">
        Earlier readings
      </h3>
      <ul className="mt-2 space-y-3">
        {earlier.map((footing) => {
          const band = overallBand(footing);
          const on = formatLongDate(footing.scoredAt.slice(0, 10));
          return (
            <li key={footing.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-muted-foreground">{on}</span>
                {/* Named by its own date, so the newest reading's band is the only "Overall footing". */}
                {band && <BandWord band={band} label={`Footing on ${on}`} className="text-sm" />}
              </div>
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {OVERALL_DIMENSIONS.map((dimension) => {
                  const scored = dimensionOf(footing, dimension);
                  if (!scored) return null;
                  return (
                    <div key={dimension} className="flex items-baseline gap-1.5">
                      <dt className="text-muted-foreground">{FOOTING_DIMENSION_LABEL[dimension]}</dt>
                      <dd>
                        <BandWord
                          band={scoreBand(scored.score)}
                          label={`${FOOTING_DIMENSION_LABEL[dimension]} on ${on}`}
                          className="text-xs"
                        />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The **Letter** dimension, beside the letter rather than with the four. It is never part of the
 * overall: a letter can be rewritten in a minute, and folding it in would let a rewrite move a number
 * that claims to be about the Tenant's history.
 *
 * It reads the attached cover-letter Document only — never the Draft — so there is nothing to show
 * for a Job whose Application kit holds no letter.
 */
export function LetterFooting({ job }: { job: Job }) {
  const { panel } = useFooting(job.id);
  const newest = panel.data?.newest ?? null;
  const scored = newest ? dimensionOf(newest, "letter") : null;
  if (!scored) return null;

  const stale = newest ? staleLine(newest.changed) : "";
  return (
    <div className="mt-4 rounded-md bg-accent/50 px-4 py-3 ring-1 ring-primary/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">Footing: your attached cover letter</span>
        <div className="flex items-baseline gap-2">
          {isUnclear(scored) && <span className="text-xs text-muted-foreground">{UNCLEAR_LABEL}</span>}
          <BandWord band={scoreBand(scored.score)} label={FOOTING_DIMENSION_LABEL.letter} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {FOOTING_DIMENSION_BLURB.letter} It isn’t part of your overall footing — a letter can be
        rewritten in a minute, and a history can’t.
      </p>
      {stale && <p className="mt-1 text-xs text-muted-foreground">{stale}</p>}
    </div>
  );
}
