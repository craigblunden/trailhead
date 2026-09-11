import { z } from "zod";

import { STAGES } from "@/lib/jobs";

/**
 * Every input crossing the server boundary passes through here. Server Actions are public POST
 * endpoints and their arguments are untrusted regardless of which component calls them — so every
 * free-text field is bounded (an unbounded text column is a denial-of-service surface), the
 * posting URL is sanitised on write, and the client-side coercions are repeated as the contract
 * rather than trusted as convenience.
 *
 * Pure: no database, no session. Importable from both sides of the boundary.
 */

export const JOB_LIMITS = {
  company: 120,
  role: 120,
  location: 120,
  postingUrl: 2048,
  description: 20_000,
  notes: 20_000,
} as const;

/** Thousands per year. Nobody is paid a billion; this bounds accidental and hostile input alike. */
const SALARY_MAX = 100_000;

const LOCATION_FALLBACK = "Location TBD";

const boundedText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const requiredText = (max: number) =>
  boundedText(max).min(1, "This field is required");

/**
 * Blank or non-numeric means "not specified". A number that parses but is negative, fractional, or
 * absurd is a mistake worth telling the user about rather than silently nulling.
 */
const salaryBound = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const text = String(value).trim();
    if (text === "") return null;
    return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
  },
  z
    .number()
    .int("Enter a whole number of thousands")
    .min(0, "Salary cannot be negative")
    .max(SALARY_MAX, "That is not a salary")
    .nullable(),
);

/**
 * `<input type="url">` accepts `javascript:` and `data:`. A stored hostile URL is a stored XSS
 * vector for every future consumer of the field, so only ordinary web links are stored.
 */
const postingUrl = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  boundedText(JOB_LIMITS.postingUrl).refine(
    (url) => {
      if (url === "") return true;
      try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a web address starting with http:// or https://" },
  ),
);

export const newJobSchema = z.object({
  company: requiredText(JOB_LIMITS.company),
  role: requiredText(JOB_LIMITS.role),
  location: z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    boundedText(JOB_LIMITS.location).transform((text) => text || LOCATION_FALLBACK),
  ),
  salaryMin: salaryBound,
  salaryMax: salaryBound,
  postingUrl,
  description: z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    boundedText(JOB_LIMITS.description),
  ),
});

export type NewJobInput = z.infer<typeof newJobSchema>;

/**
 * Editing is an allowlist, not a filter. Description, notes, and the salary expectation (which
 * the Phase-1 details card already edits) are writable; any other field in the patch is REJECTED
 * rather than dropped — so a field added later cannot become writable by accident. Stage changes
 * go through their own action because they write history.
 */
export const jobPatchSchema = z.strictObject({
  description: boundedText(JOB_LIMITS.description).optional(),
  notes: boundedText(JOB_LIMITS.notes).optional(),
  salaryMin: salaryBound.optional(),
  salaryMax: salaryBound.optional(),
});

export type JobPatchInput = z.infer<typeof jobPatchSchema>;

export const stageSchema = z.enum(STAGES);

/** Ids are opaque cuids; this only stops a caller handing us a novel. */
export const idSchema = z.string().trim().min(1).max(64);

/** Field name → first message, in the shape the forms render inline. */
export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Runs a schema and flattens its issues to one message per field. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
