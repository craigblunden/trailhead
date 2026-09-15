# 02: The erase function

**Status:** ready-for-review
**Blocked by:** 01

## What to build

`public.erase_my_account()` — `security definer`, owned by `postgres`, `set search_path = ''`, no
arguments, executable by `trailhead_app` alone. In one call (and so one transaction, the caller's):

1. Read `public.tenant_id()`. If it is null, raise — never delete "everyone whose id is null".
2. Delete the tenant's rows: `JobContact`, `ActivityEntry`, `Job`, `Contact`, `Document`,
   `GenerationQuota`, `UserPlan`. Order so no foreign key trips (links and history before Jobs;
   Jobs before Documents, or rely on `SET NULL`).
3. Delete `auth.users where id = tenant_id()`. Auth's identities, sessions, factors, and tokens
   cascade (ADR-0004).
4. Return the number of `auth.users` rows deleted (1, or 0 if already gone — a retry after a partial
   failure must not raise).

It does not touch `storage.objects`: Storage rows are never deleted with SQL (`docs/architecture.md`).

## Where it lives

- **The function** in a new `supabase/migrations/` file, beside `20260912000000_plans.sql`: it must be
  owned by `postgres` to reach `auth.users`, which the Prisma migrator cannot own.
- **The grants** `DELETE` to `postgres` on the seven tenant tables in a new Prisma migration, beside
  the tables, as the init migration grants the janitor. `postgres` has only `SELECT, DELETE` on
  `"Document"` today. Revoke `execute` from `public`; grant it to `trailhead_app`.
- Confirm the `db:reset` order (`supabase db reset && prisma migrate deploy`) leaves the function
  working: plpgsql resolves table names at call time, so a function created before the tables is
  fine, but the Prisma grants must exist before first call.

## Seams under test

`tests/integration/account-deletion.test.ts`, local stack, as `trailhead_app` inside `withTenant`:

1. Tenant A with a Job, its Activity entries, a Contact linked to it, a Document row, a quota week,
   and a `UserPlan` row: after the call, none of A's rows exist and A's `auth.users` and
   `auth.identities` rows are gone.
2. Tenant B, set up identically, is untouched — every table, and B's Auth user.
3. Called with no tenant set: raises, deletes nothing.
4. Called twice for the same tenant: the second returns 0 and does not raise.
5. `trailhead_app` still cannot `delete from auth.users` or write `UserPlan` directly — the function
   is the only path.

## Comments

**2026-09-15 (implementation):** `supabase/migrations/20260915010000_erase_my_account.sql` and `prisma/migrations/20260915000000_account_deletion_grants`; tests ERASE-1..7 in `tests/integration/account-deletion.test.ts`. Built on the local stack only, ahead of 01.

Found while building: Supabase's default privileges grant EXECUTE on every function `postgres` creates in `public` to `anon`, `authenticated`, and `service_role`, and `public` is exposed through the Data API. The Plans migration revoked only from `public`, so the publishable key could call `auth_email_of` / `auth_user_id_by_email` through `/rpc` (confirmed locally). Closed in `20260915000000_close_email_lookups.sql`; every new definer function revokes all four roles, and ERASE-6 fails if any definer function in `public` is executable by the Data API roles.

`db:reset` order was not re-run end to end (it wipes local data); `supabase migration up` + `prisma migrate deploy` applied cleanly, and plpgsql resolves the tables at call time.
