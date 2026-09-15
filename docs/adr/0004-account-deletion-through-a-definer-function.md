---
status: proposed
---

# Account deletion goes through a definer function, not a `service_role` key

Account deletion (`CONTEXT.md`) has to remove the Supabase Auth user and two tables the application
role cannot write, `UserPlan` (ADR-0001) and `GenerationQuota`, and this application holds no
credential that bypasses row-level security (`docs/architecture.md`, test STO-1). We keep it that way:
one `security definer` function owned by `postgres` and executable by `trailhead_app` erases the
current tenant — every tenant table, then its `auth.users` row — in one transaction, so a Tenant is
never left half-erased in Postgres. The user's files are removed first, through the Storage API as the
user, because the user is signed in to ask; that is what unblocks the item `docs/deferred.md` held.

## Considered options

- **A `service_role` key in one narrow server module**, calling the Auth admin API. The documented
  path, but it reverses the one boundary every other decision here leans on, for a single call.
- **The user asks, the operator erases** (`npm run db:delete-account` as the migrator). No new
  privilege, but deletion waits on a person, and the page cannot honestly say "deleted".

## Consequences

- The function keys on `tenant_id()`, the same transaction-local setting every policy trusts. It
  grants the app role nothing a bug in `withTenant()` could not already do to one Tenant's rows —
  except the login itself, which is why it erases only the tenant in scope and takes no argument.
- Order is Storage, then the function, then sign-out. A Storage failure stops with nothing erased; a
  function failure leaves the board intact and the retry finishes, since removing a missing object is
  a no-op.
- An access token outlives its Auth user until it expires, so another tab can still write rows for a
  Tenant with no Account. The `pg_cron` janitor deletes rows whose `userId` has no `auth.users` row.
  It cannot remove files: a file landed afterwards through a still-valid signed upload URL is
  orphaned, and joins the existing deferred item about objects no owner can remove.
- Verified on the local stack (2026-09-15, Postgres 17.6): `postgres` holds `DELETE` on
  `auth.users`; a definer function it owns deleted a user inside a rolled-back transaction; every
  foreign key onto `auth.users` is Auth's own and cascades; nothing in `storage` references it, so
  owning objects does not block the delete. **Hosted is not yet verified** — Supabase has tightened
  the `auth` schema there before. If hosted refuses, this ADR reopens.
- `postgres` holds only `SELECT, DELETE` on `"Document"` today. The function needs `DELETE` on every
  tenant table, granted in a Prisma migration beside the tables, as the janitor's grant is.
