/**
 * How a job's typed-in fields are read — by the forms before they send, and by the server's
 * validation when it parses — so a form never sends something other than what the server would have
 * made of the same text (architecture ticket 01). Pure, and free of zod, so the forms import it for
 * nothing.
 */

/** The longest each typed-in field may be. Validation refuses past these; the forms stop typing at them. */
export const JOB_LIMITS = {
  company: 120,
  role: 120,
  location: 120,
  postingUrl: 2048,
  description: 20_000,
  notes: 20_000,
} as const;

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
