import { z } from "zod";

import { CONTACT_KINDS, CONTACT_LIMITS } from "@/lib/contacts";
import { todayUtc } from "@/lib/dates";
import { DOCUMENT_KINDS, MAX_UPLOAD_BYTES, UPLOAD_REFUSALS, extensionOf } from "@/lib/documents";
import { locationOrFallback, salaryFromText } from "@/lib/job-fields";
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

const boundedText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const requiredText = (max: number) =>
  boundedText(max).min(1, "This field is required");

/**
 * Blank or non-numeric means "not specified". A number that parses but is negative, fractional, or
 * absurd is a mistake worth telling the user about rather than silently nulling. The forms read the
 * text with the same `salaryFromText` before they send it.
 */
const salaryBound = z.preprocess(
  salaryFromText,
  z
    .number()
    .int("Enter a whole number of thousands")
    .min(0, "Salary cannot be negative")
    .max(SALARY_MAX, "That is not a salary")
    .nullable(),
);

/** Absent or null is blank; the bound and trim still apply to anything given. */
const optionalText = (max: number) =>
  z.preprocess((value) => (value === null || value === undefined ? "" : value), boundedText(max));

/**
 * `<input type="url">` accepts `javascript:` and `data:`. A stored hostile URL is a stored XSS
 * vector for every future consumer of the field, so only ordinary web links are stored. Blank
 * means no link.
 */
const webAddress = (max: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    boundedText(max).refine(
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

const postingUrl = webAddress(JOB_LIMITS.postingUrl);

export const newJobSchema = z.object({
  company: requiredText(JOB_LIMITS.company),
  role: requiredText(JOB_LIMITS.role),
  location: z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    boundedText(JOB_LIMITS.location).transform(locationOrFallback),
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

const EMAIL = z.email();

const contactEmail = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  boundedText(CONTACT_LIMITS.email).refine((email) => email === "" || EMAIL.safeParse(email).success, {
    message: "Enter an email address like name@example.com",
  }),
);

const contactPhone = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  boundedText(CONTACT_LIMITS.phone).regex(/^[0-9 +().-]*$/, "Use digits, spaces, and + ( ) . - only"),
);

/** A `YYYY-MM-DD` that names a real day, today (UTC) at the latest. Blank means never recorded. */
const lastSpokenOn = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date")
    .refine((iso) => {
      const parsed = new Date(`${iso}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
    }, "Enter a real date")
    .refine((iso) => iso <= todayUtc(), "That date is in the future")
    .nullable(),
);

export const contactKindSchema = z.enum(CONTACT_KINDS, "Choose what kind of contact this is");

const contactFields = {
  name: requiredText(CONTACT_LIMITS.name),
  kind: contactKindSchema,
  title: optionalText(CONTACT_LIMITS.title),
  agency: optionalText(CONTACT_LIMITS.agency),
  email: contactEmail,
  phone: contactPhone,
  notes: optionalText(CONTACT_LIMITS.notes),
  linkedinUrl: webAddress(CONTACT_LIMITS.linkedinUrl),
  lastSpokenOn,
};

export const newContactSchema = z.object(contactFields);

export type NewContactInput = z.infer<typeof newContactSchema>;

/** Editing a Contact is an allowlist of its own fields; anything else is rejected, not dropped. */
export const contactPatchSchema = z.strictObject({
  name: contactFields.name.optional(),
  kind: contactFields.kind.optional(),
  title: boundedText(CONTACT_LIMITS.title).optional(),
  agency: boundedText(CONTACT_LIMITS.agency).optional(),
  email: contactFields.email.optional(),
  phone: contactFields.phone.optional(),
  notes: boundedText(CONTACT_LIMITS.notes).optional(),
  linkedinUrl: contactFields.linkedinUrl.optional(),
  lastSpokenOn: contactFields.lastSpokenOn.optional(),
});

export type ContactPatchInput = z.infer<typeof contactPatchSchema>;

/** A resume or a cover letter: what a Document is, and which slot of a Job's application kit it fills. */
export const documentKindSchema = z.enum(DOCUMENT_KINDS, "Choose resume or cover letter");

/**
 * Starting an upload. The browser sends a description of the file, never its bytes: those go
 * straight to Storage, whose bucket limits are what actually enforce size and type. These checks
 * refuse early, before a row or a token exists, with the same messages the upload control shows.
 */
export const startUploadSchema = z.object({
  kind: documentKindSchema,
  fileName: requiredText(255).refine((name) => extensionOf(name) !== null, UPLOAD_REFUSALS["unsupported-type"]),
  sizeBytes: z
    .number("That file could not be read")
    .int()
    .min(1, "That file is empty.")
    .max(MAX_UPLOAD_BYTES, UPLOAD_REFUSALS["too-large"]),
});

export type StartUploadInput = z.infer<typeof startUploadSchema>;

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
