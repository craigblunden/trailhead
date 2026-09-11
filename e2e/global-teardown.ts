import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

import { RUN_STARTED_AT } from "./global-setup";

/** The whole authority, anchored: "@localhost/" inside a password or a query string does not pass. */
const LOOPBACK = /^postgres(?:ql)?:\/\/[^@/?#]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\//;

/** The same check withTenant() makes before it sets a tenant id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The two database URLs, from the environment or `.env.local`. Read by hand: Playwright loads this
 * file as an ES module, and `@next/env`'s named exports are not available there.
 */
function databaseUrls() {
  const fromFile: Record<string, string> = {};
  const path = join(process.cwd(), ".env.local");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) fromFile[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return {
    appUrl: process.env.DATABASE_URL ?? fromFile.DATABASE_URL ?? "",
    adminUrl:
      process.env.TEST_POSTGRES_URL ??
      fromFile.TEST_POSTGRES_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  };
}

/**
 * Removes the accounts this run created, and their data, from the LOCAL stack (ticket 20).
 *
 * - Only accounts on `@example.com` created since the run started are touched.
 * - Application rows are deleted as `trailhead_app` under each account's own tenant id, so the same
 *   row-level security that guards the app decides what can be deleted — `postgres` has no rights on
 *   those tables, by design.
 * - An account that still has files in Storage is left alone and reported: removing an object takes
 *   the owner's session, which the teardown does not have, and deleting its row would orphan the file.
 *   The specs that upload delete what they upload.
 * - It refuses to run against anything but a loopback database.
 */
export default async function globalTeardown() {
  const { appUrl, adminUrl } = databaseUrls();
  if (!LOOPBACK.test(appUrl) || !LOOPBACK.test(adminUrl) || !existsSync(RUN_STARTED_AT)) return;
  const startedAt = readFileSync(RUN_STARTED_AT, "utf8").trim();

  const admin = new pg.Client({ connectionString: adminUrl });
  const app = new pg.Client({ connectionString: appUrl });
  await admin.connect();
  await app.connect();
  try {
    const { rows: users } = await admin.query<{ id: string }>(
      "select id from auth.users where email like '%@example.com' and created_at >= $1",
      [startedAt],
    );
    const kept: string[] = [];
    for (const { id } of users) {
      if (!UUID.test(id)) throw new Error(`e2e teardown: ${id} is not a user id`);
      const { rows: objects } = await admin.query(
        "select 1 from storage.objects where bucket_id = 'documents' and name like $1 limit 1",
        [`${id}/%`],
      );
      if (objects.length > 0) {
        kept.push(id);
        continue;
      }
      await app.query("begin");
      try {
        await app.query("select set_config('app.tenant_id', $1, true)", [id]);
        // Not GenerationQuota: the application may only reserve and refund letters, never delete the
        // counter, and a test's cleanup is no reason to grant it more. Those rows hold a user id, a
        // week, and a count — nothing else — and are left behind.
        for (const table of ["JobContact", "ActivityEntry", "Job", "Contact", "Document"]) {
          await app.query(`delete from "${table}" where "userId" = $1`, [id]);
        }
        await app.query("commit");
      } catch (error) {
        await app.query("rollback");
        throw error;
      }
      await admin.query("delete from auth.users where id = $1", [id]);
    }
    console.log(
      `e2e teardown: removed ${users.length - kept.length} test account(s)` +
        (kept.length ? `; kept ${kept.length} that still have files in Storage` : ""),
    );
  } finally {
    await app.end();
    await admin.end();
  }
}
