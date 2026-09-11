# 04: Tenant isolation, proven

**Status:** ready-for-review

**Blocked by:** 03

## What to build

The database itself refuses to hand one user's rows to another user, and a test proves it. After this
ticket, isolation is a property of Postgres rather than a promise made by application code — which is
the whole reason this phase exists.

**The mechanism.** A `withTenant(userId, fn)` helper wrapping a Prisma transaction whose first
statement sets the tenant id as a *transaction-local* setting. This survives Supavisor's transaction
mode because Postgres itself reverts the setting at `COMMIT`/`ROLLBACK` — the pooler cannot reassign
the connection before then. The guarantee is server-side, not pooler-side. A plain session-level
`SET` is the unsafe thing and must never appear.

**Policies use the custom setting, not `auth.uid()`.** Prisma talks to Postgres directly and bypasses
PostgREST, so `auth.uid()` is null on this path. The two-argument form of the setting lookup returns
NULL when unset, which means an unwrapped query fails *closed* rather than open. Ticket 15's storage
policies do use `auth.uid()` — a different predicate at a different layer. Do not blur them.

**`FORCE ROW LEVEL SECURITY` is required**, because a table's owner bypasses RLS by default.

**No external calls inside `withTenant`.** It holds a pooled connection under Prisma's default
transaction timeout. Read in one transaction, call out, write in a second.

This ticket also stands up the integration test level, because it is the only level that can prove
any of this: jsdom has no Postgres, and Playwright cannot assert that user B's query returned
nothing. Integration tests run in a Node environment against a real database, as a Vitest project
separate from the fast unit tests, and they do not mock Prisma — a mocked ORM tests the mock, not the
ownership rule.

## Acceptance criteria

- [ ] RLS is enabled and forced on every application table, with policies over the transaction-local
      tenant setting covering both the read predicate and the write check
- [ ] `withTenant()` exists, and a query issued outside it returns zero rows rather than all rows
- [ ] A cross-user integration test seeds rows for user A, reads as user B, and gets nothing — for
      every table
- [ ] A test proves the tenant setting does not leak past the transaction that set it
- [ ] `npm run test:integration` exists as its own Vitest project and does not slow the unit suite
- [ ] Tests truncate or roll back between cases, so no test depends on another's leftovers

## Comments

### 2026-09-11 — agent

**Built.**

- `prisma/migrations/20260911003000_tenant_isolation/` — `public.tenant_id()` reads the
  transaction-local setting (`nullif(current_setting('app.tenant_id', true), '')::uuid`, so both
  "never set" and "reverted after a transaction" fold to NULL and the query fails **closed**); RLS
  enabled **and forced** on all five application tables; one `FOR ALL TO trailhead_app` policy per
  table with both `USING` and `WITH CHECK` over the setting. Policies use the setting, never
  `auth.uid()`, because Prisma bypasses PostgREST.
- **Tightened beyond the ticket:** foreign-key checks bypass RLS, so `WITH CHECK` on `JobContact`,
  `ActivityEntry`, and `Job.documentId` additionally requires the referenced row to be visible
  under the same tenant. Without that, user B could insert a link row of their own pointing at user
  A's contact id. Now the database refuses it.
- `src/server/db/tenant.ts` — `withTenant(userId, fn)`: a Prisma interactive transaction whose
  first statement is `set_config('app.tenant_id', $1, true)`. Transaction-local, so Postgres
  reverts it at COMMIT/ROLLBACK before Supavisor can reassign the connection. Refuses a non-uuid.
  No session-level `SET` anywhere.
- `tests/integration/helpers.ts` — `resetTables()` truncates as the migrator over `DIRECT_URL`
  (the app role deliberately lacks TRUNCATE, which RLS does not govern); `newUserId()`.
- `tests/integration/tenant-isolation.test.ts` — 10 cases: RLS enabled+forced+policy on every
  table (from `pg_class`/`pg_policies`); unwrapped query → zero rows; B reads nothing of A's in
  every table; B cannot update/delete/reach A's rows by id; B cannot write a row claiming A's
  `userId`; B cannot link to A's contact; B cannot attach A's document; the setting does not leak
  past its transaction (10 parallel plain queries after a tenant transaction all report NULL and
  see nothing); 8 concurrent transactions across two tenants each see only their own; non-uuid
  refused.

`npm run test:integration` is its own Vitest project (node, serial files, real database);
`npm test` stays jsdom-only and does not touch Postgres.

**Status:** ready-for-review
