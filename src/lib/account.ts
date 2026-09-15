import { formatResetDay, type QuotaStatus } from "@/lib/generation";
import { pluralize } from "@/lib/jobs";
import type { Limit, Plan } from "@/lib/plans";

/**
 * The account page and Account deletion (CONTEXT.md), the parts both sides of the boundary share.
 * Pure.
 */

/** What the account page and the delete dialog read about the signed-in Account and its Tenant. */
export type AccountSummary = {
  name: string;
  email: string;
  /** Auth's provider ids for every way the Account signs in: `email`, `google`, `github`. */
  providers: string[];
  plan: Plan;
  jobs: number;
  /** Held, as the Documents Limit counts them. */
  documents: number;
  contacts: number;
};

/** Where Account deletion lands: the landing page, which reads the flag once and shows the notice. */
export const ACCOUNT_DELETED_PATH = "/?deleted=1";

export const ACCOUNT_DELETED_NOTICE = "Your account and everything in it has been deleted.";

export const EMAIL_MISMATCH = "Type your account's email exactly as it's shown to confirm.";

/**
 * The confirmation Account deletion asks for: the Account's email, typed. Trimmed and
 * case-insensitive, because an address is; nothing typed never matches.
 */
export function emailsMatch(typed: string, email: string): boolean {
  const normalised = typed.trim().toLowerCase();
  return normalised !== "" && normalised === email.trim().toLowerCase();
}

const METHOD_LABEL: Record<string, string> = {
  email: "Email and password",
  google: "Google",
  github: "GitHub",
};

/** Each way the Account signs in, named once, in the order Auth lists them. */
export function signInMethodLabels(providers: readonly string[]): string[] {
  return [...new Set(providers)].map(
    (id) => METHOD_LABEL[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
  );
}

/** Documents held against the Documents Limit: "2 of 3 documents", or a plain count when unlimited. */
export function documentsHeldLine(held: number, limit: Limit): string {
  return limit === "unlimited" ? pluralize(held, "document") : `${held} of ${limit} documents`;
}

/** Letters left this quota week, in the cover-letter card's terms; a Hold outranks the count. */
export function lettersLeftLine(quota: QuotaStatus): string {
  if (quota.held) return `Cover letters are paused until ${formatResetDay(quota.resetsOn)}`;
  if (quota.limit === "unlimited") return `${pluralize(quota.used, "cover letter")} written this week`;
  return `${quota.remaining} of ${quota.limit} cover letters left this week`;
}

/** What Account deletion erases, counted: "12 jobs, 3 documents, and 8 contacts". */
export function deletionContents({ jobs, documents, contacts }: Pick<AccountSummary, "jobs" | "documents" | "contacts">) {
  return `${pluralize(jobs, "job")}, ${pluralize(documents, "document")}, and ${pluralize(contacts, "contact")}`;
}
