# 04: Tenant isolation, proven

**Status:** ready-for-agent

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
