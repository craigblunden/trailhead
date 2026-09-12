import { randomUUID } from "node:crypto";

import pg from "pg";

import type { Plan } from "@/lib/plans";

/** The application tables, in an order TRUNCATE … CASCADE is happy with. */
const APPLICATION_TABLES = [
  "JobContact",
  "ActivityEntry",
  "Job",
  "Contact",
  "Document",
  "GenerationQuota",
  "UserPlan",
] as const;

/** Runs one statement as `trailhead_migrator` over the direct URL. */
async function asMigrator<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

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

/**
 * Puts a Tenant on a Plan the way `npm run db:plan` does: as the migrator, the only role with a
 * write grant on "UserPlan" (ADR-0001). The default Plan is the absence of a row.
 */
export async function setPlan(userId: string, plan: Plan) {
  await asMigrator((client) =>
    plan === "free"
      ? client.query(`delete from "UserPlan" where "userId" = $1`, [userId])
      : client.query(
          `insert into "UserPlan" ("userId", "plan", "updatedAt") values ($1, $2, now())
           on conflict ("userId") do update set "plan" = excluded."plan", "updatedAt" = now()`,
          [userId, plan],
        ),
  );
}

/** A fresh tenant id. The database has no foreign key to `auth.users`, so any uuid is a user. */
export function newUserId() {
  return randomUUID();
}
