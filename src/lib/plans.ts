import type { AttemptLength } from "@/lib/interview";

/**
 * Plans and Limits (CONTEXT.md, plans issue 01). Pure: shared by the server, the browser, and
 * the seed.
 *
 * A Tenant is on exactly one Plan, and a Plan sets its Limits: how many Documents it may hold, how
 * many cover letters may be written per week, and how many Interview Simulator Attempts may be
 * started per week (and at which lengths). A Limit may be unlimited. The numbers live here
 * and nowhere else — raising what `pro` gets is a deploy, moving a Tenant between Plans is a row
 * (ADR-0001).
 */

export const PLANS = ["free", "basic", "pro"] as const;

export type Plan = (typeof PLANS)[number];

/** How a Plan is named wherever it is shown. */
export const PLAN_LABEL: Record<Plan, string> = { free: "Free plan", basic: "Basic plan", pro: "Pro plan" };

/** A Tenant with no Plan recorded is on this one. */
export const DEFAULT_PLAN: Plan = "free";

/** A count a Plan allows, or no limit at all. */
export type Limit = number | "unlimited";

export type Limits = {
  /** Documents a Tenant may hold at once. */
  documents: Limit;
  /** Cover letters a Tenant may write in one quota week. */
  lettersPerWeek: Limit;
  /** Interview Simulator Attempts a Tenant may start in one quota week. */
  interviewsPerWeek: Limit;
  /** The Attempt lengths, in minutes, the Plan may choose between. Only `pro` gets a choice. */
  interviewLengths: readonly AttemptLength[];
};

export const PLAN_LIMITS = {
  free: { documents: 3, lettersPerWeek: 5, interviewsPerWeek: 1, interviewLengths: [5] },
  basic: { documents: 10, lettersPerWeek: 15, interviewsPerWeek: 3, interviewLengths: [5, 10] },
  // Letters and interviews stay finite on every Plan: each one is a paid model call, and
  // "unlimited" would be a bill with no ceiling.
  pro: { documents: "unlimited", lettersPerWeek: 25, interviewsPerWeek: 10, interviewLengths: [5, 10, 30] },
} as const satisfies Record<Plan, Limits>;

export function limitsOf(plan: Plan): Limits {
  return PLAN_LIMITS[plan];
}

/** True while one more would still be allowed: below the number, or any count when unlimited. */
export function withinLimit(count: number, limit: Limit): boolean {
  return limit === "unlimited" || count < limit;
}
