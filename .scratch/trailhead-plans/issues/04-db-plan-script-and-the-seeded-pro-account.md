# 04: The `db:plan` script and the seeded `pro` account

**Status:** ready-for-review
**Blocked by:** 02

## What to build

**The script.** `npm run db:plan -- <email> pro|free` puts one Tenant on a Plan; with no arguments
it lists every Tenant on `pro` as `email  plan  updatedAt`. It connects with `DIRECT_URL` — the
migrator role, the only role that may write `UserPlan` — and finds the user by email in
`auth.users`. Setting `free` deletes the row rather than writing `free`, so the table only ever
holds Tenants off the default. An unknown email is an error naming the email; nothing is created.

The SQL it runs is written out in `docs/provisioning.md` as the dashboard fallback:

```sql
insert into "UserPlan" ("userId", "plan", "updatedAt")
select id, 'pro', now() from auth.users where email = '...'
on conflict ("userId") do update set "plan" = excluded."plan", "updatedAt" = now();
```

**The seed.** A fifth account in `scripts/seed/accounts.ts`, key `pro`, verified, whose story is:
"On pro: four documents on file and seven letters written this week, both past what free allows."
The seed writes the `UserPlan` row as the migrator (the seed already runs with that connection) and
the seed's plan check (`scripts/seed/plan.ts`) validates each account's rows against **that
account's** Limits, not the free ones, so `free` accounts still cannot be seeded past their Limits.

## Decisions

- The script lives at `scripts/plan.ts`, beside `scripts/seed.ts`, and is `tsx`.
- Listing shows `pro` only. `free` is the default and would be the whole user base.
- `docs/architecture.md` gains `UserPlan` in the data-model diagram and one line under the data
  layer: the app role reads Plans and never writes them.

## Seams under test

1. `tests/seed/accounts.test.ts` — the `pro` account holds more than `free`'s Document Limit and
   has used more than `free`'s weekly letters; every other account stays within `free`.
2. `tests/seed/plan.test.ts` — an account over its own Plan's Limits is refused by the planner.
3. `tests/integration/seed.test.ts` — after seeding, the `pro` account reads as `pro`.

## Comments

**Built as written, with one deviation.** Issue 02 planned `grant select on auth.users to
trailhead_migrator`. On Supabase the `auth` schema is owned by `supabase_admin`, and `postgres` holds
usage on it without grant option, so the grant on the table succeeds and is useless: the migrator
still cannot enter the schema. The Supabase migration instead creates two `security definer`
functions owned by `postgres` — `auth_user_id_by_email(text)` and `auth_email_of(uuid)` — executable
by the migrator only. The script and the seed go through them; nothing else in `auth` is opened.

The script's core (`scripts/plan/set-plan.ts`) takes a `pg` client so the CLI, the seed, and the
integration test share one set of statements. `tests/integration/plan-script.test.ts` runs it against
real Auth users.
