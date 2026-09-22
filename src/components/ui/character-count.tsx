/**
 * How much of a box's cap the text has used. Shown from the first character by default, because a
 * box whose count only appears near the cap has no count as far as almost every user is concerned:
 * against a 20,000 cap, nothing a person types by hand ever reaches the last fifth. `from` is for a
 * box short enough that the count is noise until the cap is in reach.
 *
 * Polite, and mounted from the start under the boxes that pass no `from`, which is the case a live
 * region actually announces: a region inserted at the same moment as its first text usually is not
 * read out at all.
 *
 * The box itself carries `maxLength`, so the count is what explains why typing stopped. Text already
 * stored above the cap still reads honestly here: it counts past `max` rather than pretending to fit.
 */
export function CharacterCount({
  length,
  max,
  from = 0,
}: {
  length: number;
  max: number;
  /** The length the count appears at. Omitted, it is always there. */
  from?: number;
}) {
  if (length < from) return null;

  return (
    <p className="mt-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {length.toLocaleString("en-US")} of {max.toLocaleString("en-US")}
    </p>
  );
}
