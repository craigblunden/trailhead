import pg from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";

/** Who the connection is, and whether the role could sidestep row-level security. */
async function whoami(connectionString: string) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const { rows } = await client.query<{ role: string; bypassrls: boolean }>(
      "select current_user as role, (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls",
    );
    return rows[0];
  } finally {
    await client.end();
  }
}

describe("ticket 02: Prisma 7 talks to Supabase", () => {
  it("the application connects through the transaction-mode URL as trailhead_app, NOBYPASSRLS", async () => {
    const rows = await prisma.$queryRaw<{ role: string; bypassrls: boolean }[]>`
      select current_user as role,
             (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls
    `;
    expect(rows[0]).toEqual({ role: "trailhead_app", bypassrls: false });
  });

  it("migrations connect through the session-mode URL as trailhead_migrator, NOBYPASSRLS", async () => {
    expect(await whoami(process.env.DIRECT_URL!)).toEqual({
      role: "trailhead_migrator",
      bypassrls: false,
    });
  });

  it("ticket 01: neither application role can bypass row-level security (from the catalog, not the migration)", async () => {
    const rows = await prisma.$queryRaw<{ rolname: string; rolbypassrls: boolean }[]>`
      select rolname, rolbypassrls from pg_roles where rolname in ('trailhead_app', 'trailhead_migrator') order by rolname
    `;
    expect(rows).toEqual([
      { rolname: "trailhead_app", rolbypassrls: false },
      { rolname: "trailhead_migrator", rolbypassrls: false },
    ]);
  });
});
