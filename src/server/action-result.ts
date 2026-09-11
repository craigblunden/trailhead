import "server-only";

import { UnauthenticatedError, getOptionalSession } from "@/server/auth/session";
import { NotFoundError, RuleError } from "@/server/data/errors";
import { logError } from "@/server/log";
import { idSchema, parseInput, type FieldErrors } from "@/server/validation";

/**
 * What every Server Action returns, and the one place a thrown error becomes something a client
 * may see. Server Actions are public POST endpoints: they validate, call the data layer, and
 * translate. A Prisma error, a stack trace, a constraint name, a storage key, or a column name
 * never reaches the client — only the messages below and the typed domain errors' own messages,
 * which are written to be shown.
 */

export type ActionFailure = {
  ok: false;
  error: "unauthenticated" | "invalid" | "not-found" | "rejected" | "failed";
  /** Safe to show the user as-is. */
  message: string;
  fields?: FieldErrors;
  /** For `rejected`: which rule said no, so the UI can render its designed state. */
  code?: string;
};

export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

/** The messages for failures that carry no message of their own. Shared with the cover-letter route. */
export const ACTION_MESSAGES = {
  unauthenticated: "Your session has ended. Sign in again to continue.",
  invalid: "Check the highlighted fields.",
  failed: "Something went wrong on our side. Your changes weren't saved — please try again.",
} as const;

export function invalid(fields: FieldErrors): ActionFailure {
  return { ok: false, error: "invalid", message: ACTION_MESSAGES.invalid, fields };
}

/** What an id is meant to name, for the answer a malformed one gets. */
export type IdOf = "job" | "contact" | "document";

/**
 * The one way an action reads an id it was sent. Ids are opaque, so a malformed one is nothing the
 * user can fix in a form: every action answers it with the same `invalid` result, naming what the id
 * was meant to be, and never reaches the data layer.
 */
export function parseId(id: unknown, what: IdOf): { ok: true; id: string } | { ok: false; failure: ActionFailure } {
  const parsed = parseInput(idSchema, id);
  return parsed.ok ? { ok: true, id: parsed.data } : { ok: false, failure: invalid({ id: `Unknown ${what}` }) };
}

/** Runs a data-layer call and turns whatever it throws into a result the client may see. */
export async function runAction<T>(
  operation: string,
  work: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      // An action cannot redirect the way a render can; the client re-authenticates.
      return { ok: false, error: "unauthenticated", message: ACTION_MESSAGES.unauthenticated };
    }
    if (error instanceof NotFoundError) {
      // The same message for a missing id and a foreign one — see NotFoundError.
      return { ok: false, error: "not-found", message: error.shown };
    }
    if (error instanceof RuleError) {
      return { ok: false, error: "rejected", code: error.code, message: error.message };
    }
    const session = await getOptionalSession().catch(() => null);
    logError({ operation, tenant: session?.userId ?? null }, error);
    return { ok: false, error: "failed", message: ACTION_MESSAGES.failed };
  }
}
