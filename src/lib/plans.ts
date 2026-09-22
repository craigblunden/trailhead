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
  free: { documents: 3, lettersPerWeek: 5, interviewsPerWeek: 1, interviewLengths: [15] },
  basic: { documents: 10, lettersPerWeek: 15, interviewsPerWeek: 3, interviewLengths: [15, 20] },
  // Letters and interviews stay finite on every Plan: each one is a paid model call, and
  // "unlimited" would be a bill with no ceiling.
  pro: { documents: "unlimited", lettersPerWeek: 25, interviewsPerWeek: 10, interviewLengths: [15, 20, 30] },
} as const satisfies Record<Plan, Limits>;

export function limitsOf(plan: Plan): Limits {
  return PLAN_LIMITS[plan];
}

/** True while one more would still be allowed: below the number, or any count when unlimited. */
export function withinLimit(count: number, limit: Limit): boolean {
  return limit === "unlimited" || count < limit;
}

/**
 * An Upgrade request (CONTEXT.md): a Tenant's asking to be moved to the next Plan up. Kept as a row,
 * but whether one is still **pending** is derived here from the Tenant's Plan and the clock, never
 * stored as a status (ADR-0009).
 */
export type UpgradeRequest = {
  plan: Plan;
  requestedAt: Date;
};

/** How long a request goes unanswered before it lapses and the Tenant may ask again. */
export const UPGRADE_REQUEST_LAPSES_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a Plan sits on the ladder. `PLANS` is in rising order, so the index is the rank. */
const rankOf = (plan: Plan): number => PLANS.indexOf(plan);

/** The Plan one rung up, or null on the top Plan — the Plan an Upgrade request would name. */
export function nextPlanUp(plan: Plan): Plan | null {
  // `.at` rather than an index: the top Plan has nothing above it, and that must be a value, not `undefined`.
  return PLANS.at(rankOf(plan) + 1) ?? null;
}

/** True while `plan` is above `current` on the ladder. */
export function isAbove(plan: Plan, current: Plan): boolean {
  return rankOf(plan) > rankOf(current);
}

/**
 * Whether an Upgrade request is still outstanding: it asks for a Plan the Tenant is not yet on, and
 * it has not lapsed. Granting the Plan — or granting a higher one — resolves it, which is why there is
 * no status to flip (ADR-0009). Silence resolves it too, after the lapse: ignoring a request is a soft
 * no that expires, rather than a button disabled for good.
 */
export function isUpgradeRequestPending(request: UpgradeRequest, current: Plan, now: Date): boolean {
  if (!isAbove(request.plan, current)) return false;
  return now.getTime() - request.requestedAt.getTime() < UPGRADE_REQUEST_LAPSES_AFTER_DAYS * DAY_MS;
}

/** What a Tenant is told when they ask again while a request is still outstanding. */
export const ALREADY_REQUESTED = "You’ve already asked to upgrade. I’ll be in touch.";

/** What a Tenant is told if they somehow ask from the top Plan — the button is never shown there. */
export const TOP_PLAN = "You’re already on the highest plan.";

/** The button's label, and what it says once the asking is done. */
export const askToUpgradeLabel = (plan: Plan) => `Ask to upgrade to ${PLAN_LABEL[plan].replace(" plan", "")}`;

export const UPGRADE_REQUESTED_LABEL = "Upgrade requested — I’ll be in touch";
