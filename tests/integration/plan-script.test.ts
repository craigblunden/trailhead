import { readFileSync } from "node:fs";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { signOut } from "./session-mock";

import { currentPlan } from "@/server/data/plans";

import { listPlans, setPlanByEmail } from "../../scripts/plan/set-plan";

import { resetTables } from "./helpers";
import { actAs, asJanitor, realUser, type RealUser } from "./storage-helpers";

/** The SQL `docs/provisioning.md` gives for the dashboard, one statement per entry, for `email`. */
function documentedPlanSql(email: string): string[] {
  const doc = readFileSync(new URL("../../docs/provisioning.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf("## Putting an account on a Plan"));
  const block = section.match(/```sql\r?\n([\s\S]*?)```/)?.[1];
  if (!block) throw new Error("docs/provisioning.md has no SQL block under 'Putting an account on a Plan'.");
  return block
    .replaceAll("you@example.com", email)
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * `npm run db:plan` (plans issue 04), run the way the script runs it: as the migrator over the
 * direct URL, given an email, against real Auth users.
 */

let migrator: pg.Client;
let alice: RealUser;
let bob: RealUser;

beforeAll(async () => {
  migrator = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await migrator.connect();
  [alice, bob] = await Promise.all([realUser(), realUser()]);
}, 60_000);

afterAll(async () => {
  await resetTables();
  await migrator.end();
});

beforeEach(async () => {
  await resetTables();
  signOut();
});

describe("npm run db:plan", () => {
  it("PLAN-8: puts the user with that email on pro, lists them, moves them to basic, and free takes the row away again", async () => {
    await setPlanByEmail(migrator, alice.email, "pro");
    actAs(alice);
    expect(await currentPlan()).toBe("pro");
    actAs(bob);
    expect(await currentPlan()).toBe("free");

    expect((await listPlans(migrator)).map(({ email, plan }) => ({ email, plan }))).toEqual([
      { email: alice.email, plan: "pro" },
    ]);

    await setPlanByEmail(migrator, alice.email, "basic");
    actAs(alice);
    expect(await currentPlan()).toBe("basic");
    expect((await listPlans(migrator)).map(({ plan }) => plan)).toEqual(["basic"]);

    await setPlanByEmail(migrator, alice.email, "free");
    actAs(alice);
    expect(await currentPlan()).toBe("free");
    expect(await listPlans(migrator)).toEqual([]);
  });

  it("PLAN-9: an email nobody signed up with is an error naming it, and nothing is written", async () => {
    await expect(setPlanByEmail(migrator, "nobody@trailhead.test", "pro")).rejects.toThrow(/nobody@trailhead\.test/);
    expect(await listPlans(migrator)).toEqual([]);
  });

  it("PLAN-10: the email is matched without regard to case", async () => {
    await setPlanByEmail(migrator, alice.email.toUpperCase(), "pro");
    actAs(alice);
    expect(await currentPlan()).toBe("pro");
  });
});

describe("the SQL in docs/provisioning.md", () => {
  it("PLAN-11: run as the migrator, moves only the user with that email, and back to free", async () => {
    const statements = documentedPlanSql(alice.email);
    expect(statements).toHaveLength(2);
    const [putOnPlan, backToFree] = statements;

    await migrator.query(putOnPlan);
    actAs(alice);
    expect(await currentPlan()).toBe("pro");
    actAs(bob);
    expect(await currentPlan()).toBe("free");
    expect((await listPlans(migrator)).map(({ email }) => email)).toEqual([alice.email]);

    await migrator.query(backToFree);
    expect(await listPlans(migrator)).toEqual([]);
  });

  it("PLAN-12: an email nobody signed up with is refused, and nothing is written", async () => {
    const [putOnPlan] = documentedPlanSql("nobody@trailhead.test");
    await expect(migrator.query(putOnPlan)).rejects.toThrow(/userId/);
    expect(await listPlans(migrator)).toEqual([]);
  });

  it("PLAN-13: the dashboard's postgres role has no grant to write a Plan, as the doc says", async () => {
    const [putOnPlan] = documentedPlanSql(alice.email);
    await expect(asJanitor((client) => client.query(putOnPlan))).rejects.toThrow(/permission denied/);
  });
});
