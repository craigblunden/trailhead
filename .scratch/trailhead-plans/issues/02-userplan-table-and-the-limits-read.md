# 02: The `UserPlan` table and the Limits read

**Status:** ready-for-review
**Blocked by:** 01

## What to build

A migration and a Prisma model for the Tenant's Plan, and one data function that answers "what
are this Tenant's Limits?".

```prisma
enum Plan { free pro }

/// Which Plan a Tenant is on (ADR-0001). No row means `free`. The app role only reads this.
model UserPlan {
  userId    String   @id @db.Uuid
  plan      Plan
  updatedAt DateTime @default(now())
}
```

The migration, in the repo's style (a new file; the provisioning migration is never edited):

- creates the enum and the table;
- `alter table ... enable row level security` and `force row level security`, one `select` policy
  comparing `"userId"` to `tenant_id()` like every other table;
- `grant select on "UserPlan" to trailhead_app` — and **no** insert, update, or delete;
- `grant select on auth.users to trailhead_migrator`, for the script in issue 04 to find a user by
  email.

`src/server/data/plans.ts`:

```ts
/** The Tenant's Plan, `free` when no row exists. */
export async function currentPlan(): Promise<Plan>;
/** The Tenant's Limits, by way of its Plan. */
export async function limits(): Promise<Limits>;
```

Both call `requireSession()` first, like every data function, and read under `withTenant`.

## Decisions

- No trigger on `auth.users` and no row at sign-up. Absence is `free`; the table only ever holds
  Tenants someone has moved off the default.
- The read is not memoised across a request beyond what React `cache` gives a render pass. The two
  enforcement sites each read it in their own transaction, so a Plan change lands on the next
  action.

## Seams under test

1. `tests/integration/tenant-isolation.test.ts` — a `UserPlan` row for one Tenant is invisible to
   another; the app role cannot insert or update a row (the grant is the boundary, so the test
   proves the grant).
2. `tests/integration/plans.test.ts` — no row reads as `free`; a `pro` row (written as the
   migrator, the way the script will) reads as `pro` with `pro`'s Limits.

## Comments

**Two things the migration learned.** Forced row-level security binds the table's owner too, so a
SELECT-only policy would have stopped the migrator from writing the row it exists to write: the
migrator is named in a policy of its own, and the tenant-isolation test asserts exactly that pair.
And the planned `grant select on auth.users` cannot work on Supabase (see issue 04's comment); the
email lookup is two definer functions instead.

Seam 1's "the app role cannot insert or update a row" is asserted in `tests/integration/plans.test.ts`
(PLAN-6) rather than in the tenant-isolation file, which checks the policies' shape instead.
