import type { Plan } from "@/lib/plans";

/**
 * Putting a Tenant on a Plan (plans issue 04, ADR-0001). Runs as `trailhead_migrator`: the app
 * role has no grant to write "UserPlan", and this is the one place anything does. The default
 * Plan is the absence of a row, so setting it deletes rather than writes — the table only ever
 * holds Tenants someone moved off the default.
 *
 * The client is handed in so the CLI, the seed, and the tests share one set of statements.
 */

/** The slice of a `pg` client this needs, so callers are not tied to one class. */
export type SqlClient = {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

export type PlanRow = { email: string; plan: Plan; updatedAt: Date };

export async function setPlanForUser(client: SqlClient, userId: string, plan: Plan): Promise<void> {
  if (plan === "free") {
    await client.query(`delete from "UserPlan" where "userId" = $1`, [userId]);
    return;
  }
  await client.query(
    `insert into "UserPlan" ("userId", "plan", "updatedAt") values ($1, $2, now())
     on conflict ("userId") do update set "plan" = excluded."plan", "updatedAt" = now()`,
    [userId, plan],
  );
}

/**
 * Finds the user by email (case-insensitively, as Auth stores it), then sets the Plan. The lookup
 * is a definer function from the Supabase migration: the migrator cannot read `auth` itself.
 */
export async function setPlanByEmail(client: SqlClient, email: string, plan: Plan): Promise<{ userId: string }> {
  const { rows } = await client.query<{ id: string | null }>(`select public.auth_user_id_by_email($1) as id`, [
    email,
  ]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user has signed up with ${email}.`);
  await setPlanForUser(client, id, plan);
  return { userId: id };
}

/** Every Tenant off the default Plan, by email. */
export async function listPlans(client: SqlClient): Promise<PlanRow[]> {
  const { rows } = await client.query<PlanRow>(
    `select public.auth_email_of("userId") as email, "plan", "updatedAt"
       from "UserPlan"
      order by 1`,
  );
  return rows;
}
