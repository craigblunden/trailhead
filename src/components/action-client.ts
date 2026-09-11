import { SESSION_ENDED_PATH } from "@/lib/auth-routing";
import type { ActionFailure, ActionResult } from "@/server/action-result";

/*
 * How every browser client reads a Server Action's answer — jobs, contacts, documents, and the
 * cover letter's status — so a failure means the same thing, in the same words, everywhere.
 */

/** An action said no. `message` is safe to show; `kind` says what to do about it. */
export class ActionError extends Error {
  constructor(
    readonly kind: ActionFailure["error"],
    message: string,
    /** Per-field messages for an `invalid` result, in the shape forms render inline. */
    readonly fields: Record<string, string> = {},
    /** For a `rejected` result: which rule said no. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/** A successful result's data, or the failure as an `ActionError`. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  if (result.error === "unauthenticated" && typeof window !== "undefined") {
    // The session ended under us. Nothing on this page can succeed now; go and get a new one.
    window.location.assign(SESSION_ENDED_PATH);
  }
  throw new ActionError(result.error, result.message, result.fields, result.code);
}

/**
 * A Server Action as a client method: resolves with its data, or throws its failure as an
 * `ActionError`. Every client over Server Actions is built from this one mapping. An action's
 * arguments are `unknown` on the server, so the client interface it fills decides their types.
 */
export function unwrapping<Args extends unknown[], T>(
  action: (...args: Args) => Promise<ActionResult<T>>,
): (...args: Args) => Promise<T> {
  return async (...args) => unwrap(await action(...args));
}

/** What went wrong, in words written for the user: a field message, a rule's message, or a fallback. */
export function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof ActionError) {
    return Object.values(error.fields)[0] ?? error.message;
  }
  return fallback;
}
