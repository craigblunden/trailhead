# 03: The janitor sweeps rows with no Account

**Status:** ready-for-review
**Blocked by:** 02

## Why

`getClaims()` verifies an access token locally, so a token issued before Account deletion keeps
working until it expires (`jwt_expiry`, an hour by default). A second tab or device can write a Job,
a Contact, an Activity entry, or a quota week for a Tenant whose Account is gone. Nothing would ever
remove those rows.

## What to build

`public.sweep_accountless()` — deletes rows in every tenant table whose `userId` has no `auth.users`
row. Owned by `postgres`, run by `pg_cron`, in a `supabase/migrations/` file beside the provisioning
schedule. Either a second schedule or a call from the existing `trailhead-sweep-documents` job;
pick whichever keeps the cron list honest about what runs.

- `Document` rows are the exception: a Document row with no Account is **not** deleted while its
  object still exists in `storage.objects` — no one can remove that object now, and the row is the
  only record it exists. Leave those for the deferred item (issue 07 records it). Once the object is
  gone, the row goes.
- Idempotent, like `sweep_documents()`. Returns how many rows it deleted.

## Seams under test

In `tests/integration/account-deletion.test.ts` (called directly as `postgres`, not waiting for cron):

1. After `erase_my_account()` for A, insert a Job and a Contact for A's old id as `trailhead_app`
   (the stale-token race). The sweep deletes both.
2. B's rows are untouched.
3. A Document row for A's old id whose object still exists survives the sweep; with no object, it
   goes.

## Comments

**2026-09-15 (implementation):** A second schedule, `trailhead-sweep-accountless`, hourly. One
addition beyond the ticket: a row last written within the past two hours is left for a later run.
That is longer than an access token lives (`jwt_expiry`, 3600 s), so a stale token cannot still be
writing to it, and the integration suites, which write rows under made-up tenant ids with no Auth
user, are never swept mid-test by the local stack's cron. SWEEP-2 covers it.
