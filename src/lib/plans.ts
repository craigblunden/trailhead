/**
 * Plans and Limits (CONTEXT.md, plans issue 01). Pure: shared by the server, the browser, and
 * the seed.
 *
 * A Tenant is on exactly one Plan, and a Plan sets its Limits: how many Documents it may hold, and
 * how many cover letters may be written per week. A Limit may be unlimited. The numbers live here
 * and nowhere else — raising what `pro` gets is a deploy, moving a Tenant between Plans is a row
 * (ADR-0001).
 */

export const PLANS = ["free", "pro"] as const;

export type Plan = (typeof PLANS)[number];

/** A Tenant with no Plan recorded is on this one. */
export const DEFAULT_PLAN: Plan = "free";

/** A count a Plan allows, or no limit at all. */
export type Limit = number | "unlimited";

export type Limits = {
  /** Documents a Tenant may hold at once. */
  documents: Limit;
  /** Cover letters a Tenant may write in one quota week. */
  lettersPerWeek: Limit;
};

export const PLAN_LIMITS = {
  free: { documents: 3, lettersPerWeek: 5 },
  // Letters stay finite on every Plan: each one is a paid model call, and "unlimited" would be a
  // bill with no ceiling.
  pro: { documents: "unlimited", lettersPerWeek: 25 },
} as const satisfies Record<Plan, Limits>;

export function limitsOf(plan: Plan): Limits {
  return PLAN_LIMITS[plan];
}
