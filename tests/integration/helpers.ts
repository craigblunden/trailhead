import { randomUUID } from "node:crypto";

import pg from "pg";

/** The application tables, in an order TRUNCATE … CASCADE is happy with. */
const APPLICATION_TABLES = [
  "JobContact",
  "ActivityEntry",
  "Job",
  "Contact",
  "Document",
  "GenerationQuota",
] as const;

/**
 * Empties every application table so no test depends on another's leftovers.
 *
 * Runs as `trailhead_migrator` over the direct URL: it owns the tables, and TRUNCATE is a
 * privilege the application role deliberately does not have. Row-level security does not apply to
 * TRUNCATE, which is exactly why the app role must not be able to do it.
 */
export async function resetTables() {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(
      `truncate ${APPLICATION_TABLES.map((t) => `"${t}"`).join(", ")} cascade`,
    );
  } finally {
    await client.end();
  }
}

/** A fresh tenant id. The database has no foreign key to `auth.users`, so any uuid is a user. */
export function newUserId() {
  return randomUUID();
}
