# 01: Hosted allows what local does — `postgres` may delete from `auth.users`

**Status:** ready
**Type:** task (a human step: the hosted SQL editor)

ADR-0004 rests on one fact about the platform. It was verified on the local stack on 2026-09-15
(Postgres 17.6): `postgres` holds `DELETE` on `auth.users`, a definer function it owns deleted a user
inside a rolled-back transaction, every foreign key onto `auth.users` is Auth's own and cascades, and
nothing in `storage` references it. Hosted Supabase has tightened the `auth` schema before, so it is
checked there before issue 02 builds on it.

## What to do

In the hosted project's SQL editor (it runs as `postgres`), read-only:

```sql
select has_table_privilege('postgres', 'auth.users', 'DELETE') as can_delete;

select conrelid::regclass::text as tbl, conname, confdeltype
  from pg_constraint
 where confrelid = 'auth.users'::regclass;
```

Expected: `can_delete = true`; every row's table is in `auth`, and `confdeltype = 'c'` (cascade).

## Outcomes

- **As expected:** record the result below and mark resolved. Issue 02 proceeds.
- **`can_delete` is false, or a non-`auth` table references `auth.users` without cascade:** stop.
  ADR-0004 reopens — the options it rejected (a narrowly held `service_role` key, or an
  operator-run script) come back to the table.

## Comments

**2026-09-15 (implementation):** Not run. The agent could not query hosted, and the user chose to build 02–07 against the local stack first. The probe and where to record its result are now in `docs/provisioning.md` ("Before Account deletion goes live"). ADR-0004 stays `proposed` until this passes.
