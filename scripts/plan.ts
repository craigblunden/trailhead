/**
 * `npm run db:plan -- <email> pro|free` puts one Tenant on a Plan; `npm run db:plan` alone lists
 * every Tenant off the default. Runs as `trailhead_migrator` over `DIRECT_URL` — the only role
 * with a write grant on "UserPlan" (ADR-0001) — so it works against the hosted project as well
 * as the local stack. The SQL it runs is in `docs/provisioning.md` for the dashboard.
 */
import nextEnv from "@next/env";
import pg from "pg";

import { PLANS, type Plan } from "@/lib/plans";

// Same precedence as the running app (`.env.local` over `.env`).
nextEnv.loadEnvConfig(process.cwd());

const { listPlans, setPlanByEmail } = await import("./plan/set-plan");

const USAGE = `Usage:
  npm run db:plan                     list every account on a plan other than free
  npm run db:plan -- <email> pro      put the account with that email on pro
  npm run db:plan -- <email> free     put it back on free`;

function isPlan(value: string): value is Plan {
  return (PLANS as readonly string[]).includes(value);
}

const [email, plan] = process.argv.slice(2);
if ((email && !plan) || (plan && !isPlan(plan))) {
  console.error(USAGE);
  process.exit(2);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. It is the migrator's direct connection string (docs/provisioning.md).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  if (email && plan && isPlan(plan)) {
    await setPlanByEmail(client, email, plan);
    console.log(`${email} is on ${plan}.`);
  } else {
    const rows = await listPlans(client);
    if (rows.length === 0) {
      console.log("Every account is on free.");
    } else {
      const width = Math.max(...rows.map((row) => row.email.length));
      for (const row of rows) {
        console.log(`${row.email.padEnd(width)}  ${row.plan}  ${row.updatedAt.toISOString().slice(0, 10)}`);
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
