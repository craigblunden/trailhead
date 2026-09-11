import "server-only";

/**
 * Server-side error logging with enough context to diagnose — the operation, the tenant, the
 * error's name and message — and nothing sensitive. Never a session token, never a password,
 * never a full user record, never the raw error object (a Prisma error carries the query and its
 * parameters). One line of JSON, so a log platform can index it.
 */
export type LogContext = {
  operation: string;
  /** The tenant's user id, when known. An id, never an email or a record. */
  tenant?: string | null;
};

const REDACT = /(token|password|secret|authorization|cookie)/i;

/** A key that looks like a secret never makes it into a log line, whatever its value. */
export function redact(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, REDACT.test(key) ? "[redacted]" : value]),
  );
}

export function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

export function logError(context: LogContext, error: unknown): void {
  const line = {
    level: "error",
    at: new Date().toISOString(),
    ...redact(context),
    error: describeError(error),
  };
  console.error(JSON.stringify(line));
}
