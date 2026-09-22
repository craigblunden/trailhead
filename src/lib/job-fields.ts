/**
 * How a job's typed-in fields are read — by the forms before they send, and by the server's
 * validation when it parses — so a form never sends something other than what the server would have
 * made of the same text (architecture ticket 01). Pure, and free of zod, so the forms import it for
 * nothing.
 */

/**
 * The longest each typed-in field may be. Validation holds every field to them, by one of two rules:
 * the short ones refuse past the bound, because a name or a link that long is a mistake worth a
 * message rather than text worth keeping most of; the long free-text bodies — the description and
 * the notes — strip the excess instead, since a body that long is a paste to be kept, not a mistake.
 *
 * Stripping is for the two boxes on the job page that edit a body in place: they carry the bound as
 * `maxLength` and count up to it, so what the server cuts is only ever what a caller going around
 * them sent. Everywhere a field is refused instead, the form answers with the message.
 */
export const JOB_LIMITS = {
  company: 120,
  role: 120,
  location: 120,
  postingUrl: 2048,
  description: 20_000,
  notes: 20_000,
  rejectionLetter: 20_000,
} as const;

/**
 * Text as the database will hold it: trimmed, and cut to `max` with the excess stripped rather than
 * refused. The boxes stop typing at the same `max`, so this only ever bites on a caller going around
 * them — for whom a silent cut is the right answer: an unbounded text column is what a bloated row
 * is written through, and there is nothing here for an error message to tell them.
 *
 * Counted in the UTF-16 units the box's `maxLength` and its count both count, but never cut through
 * the middle of a surrogate pair: half an emoji is not valid UTF-8, and Postgres refuses to store it.
 */
export function capText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const last = cut.charCodeAt(max - 1);
  const whole = last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
  return whole.trimEnd();
}

export const LOCATION_FALLBACK = "Location TBD";

/** A blank location reads as the Phase-1 default. */
export function locationOrFallback(text: string): string {
  return text.trim() || LOCATION_FALLBACK;
}

/**
 * Blank or non-numeric means "not specified". A number that parses is kept as typed — negative,
 * fractional, or absurd — so validation can refuse it with a reason rather than it being silently
 * nulled.
 */
export function salaryFromText(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (text === "") return null;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}
