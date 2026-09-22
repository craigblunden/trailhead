import { randomUUID } from "node:crypto";

import type { Plan } from "@/lib/plans";

import { setPlanForUser, withMigrator, type SqlClient } from "../../scripts/plan/set-plan";

/** The application tables, in an order TRUNCATE … CASCADE is happy with. */
const APPLICATION_TABLES = [
  "JobContact",
  "ActivityEntry",
  "AttemptQuestion",
  "Attempt",
  "PracticeQuestion",
  "PracticeRound",
  "FootingDimension",
  "Footing",
  "Job",
  "Contact",
  "Document",
  "GenerationQuota",
  "InterviewQuota",
  "TermsAcceptance",
  "UpgradeRequest",
  "UserPlan",
] as const;

/** Runs work as `trailhead_migrator` over the direct URL. */
const asMigrator = <T>(fn: (client: SqlClient) => Promise<T>) => withMigrator(process.env.DIRECT_URL ?? "", fn);

/**
 * Empties every application table so no test depends on another's leftovers.
 *
 * Runs as `trailhead_migrator` over the direct URL: it owns the tables, and TRUNCATE is a
 * privilege the application role deliberately does not have. Row-level security does not apply to
 * TRUNCATE, which is exactly why the app role must not be able to do it.
 */
export async function resetTables() {
  await asMigrator((client) =>
    client.query(`truncate ${APPLICATION_TABLES.map((t) => `"${t}"`).join(", ")} cascade`),
  );
}

/** Puts a Tenant on a Plan the way `npm run db:plan` does: the script's own statements, as the migrator. */
export async function setPlan(userId: string, plan: Plan) {
  await asMigrator((client) => setPlanForUser(client, userId, plan));
}

/** A fresh tenant id. The database has no foreign key to `auth.users`, so any uuid is a user. */
export function newUserId() {
  return randomUUID();
}
