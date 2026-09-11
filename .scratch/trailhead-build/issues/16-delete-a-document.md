# 16: Delete a document

**Status:** ready-for-review

**Blocked by:** 15

## What to build

A user deletes a document, it disappears from their list, and the underlying file is genuinely gone
from storage rather than orphaned and quietly billed forever.

**Never delete storage rows with SQL, and never cascade to them.** A direct `DELETE` or a foreign key
from `Document` orphans the object in the underlying store while the row vanishes — Supabase warns
about exactly this, and the bill keeps arriving for a file nobody can see.

**Tombstone, then reconcile.** Mark the document deleted in one transaction, remove the object through
the Storage API, then hard-delete the row. A scheduled sweep retries whatever the request did not
finish, which is safe because removing a key that is already gone is a no-op. This is the mirror image
of ticket 15's pending-row-first upload: the database always knows about an object before it exists,
and still knows about it until after it is gone.

**`pg_cron` runs the sweep, and that is all it does.** It is a janitor, not a queue. There is no queue
in this phase, and this sweep is not the beginning of one.

## Acceptance criteria

- [ ] A user deletes a document and it leaves their list immediately
- [ ] The object is removed from the bucket, verified by attempting to sign a URL for it afterwards
- [ ] No SQL statement in the codebase deletes from the storage objects table, and no foreign key or
      cascade reaches it
- [ ] A deletion interrupted after the tombstone and before the object removal is completed by the
      sweep, proven by a test that simulates the interruption
- [ ] The sweep is idempotent — running it twice over the same tombstone is harmless
- [ ] The sweep is scheduled and its schedule is recorded where a developer will find it
- [ ] A cross-user test proves user B cannot delete user A's document
- [ ] Deleting a document that a job references leaves the job intact, with the reference handled
      rather than dangling

## Comments

### 2026-09-11 — agent (built with ticket 15)

**Built.** `deleteDocument()` is tombstone, then reconcile:

1. One transaction: detach it from every Job (so it stops being attached the moment it leaves the
   list), then set `deletedAt`.
2. Remove the object through the Storage API **as the user**.
3. Hard-delete the row. If step 2 or 3 fails, the call still succeeds for the user (the document is
   gone from their view), the error is logged, and the tombstone waits for the sweep.

**The sweep — a decision to review.** The ticket says `pg_cron` runs the sweep. It runs the database
half, but it cannot remove objects: `storage.objects` carries a `protect_objects_delete` trigger (so
SQL deletes are refused anyway), and removing through the Storage API needs a credential. The only
credential that could act for an absent user is `service_role`, which ticket 15 forbids anywhere. So
the sweep has two halves, and neither holds a key that bypasses the storage policies:

- **`public.sweep_documents()`** (migration `20260911110000_document_sweep`; scheduled
  `*/15 * * * *` as `trailhead-sweep-documents` in the provisioning migration; runs as `postgres`):
  tombstones uploads still not `ready` after 3 hours (a signed upload token lives 2), and
  hard-deletes tombstoned rows whose object no longer exists. It only *reads* `storage.objects`.
  `postgres` gets `UPDATE ("deletedAt")` on `Document` and nothing more; `EXECUTE` is revoked from
  `PUBLIC`.
- **`sweepMyDocuments()`**, the owner's half: tombstones the user's abandoned uploads, removes every
  tombstone's object through the Storage API, deletes the rows. It runs at the start of every upload
  (so a stuck row never holds a slot the user is reaching for).

**The residual:** a tombstone whose object removal failed stays until that user next uploads. For a
user who never returns, that object is orphaned and billed. If that is not acceptable, the fix is a
server-side job holding a narrowly scoped credential (for example `pg_net` from `pg_cron` with a key
in Vault) — which reverses ticket 15's "no `service_role` anywhere", so it is the user's call.

**Tests** (`tests/integration/documents.test.ts`): a delete leaves the list at once, and signing a
URL for the key afterwards fails; an interruption after the tombstone (Storage removal forced to
fail) leaves a tombstoned row and a live object, the sweep finishes both, and a second sweep deletes
nothing; the sweep reclaims abandoned uploads with and without an object; `pg_cron`'s function,
called twice as `postgres`, finishes a row whose object is gone, deletes an abandoned upload that
never arrived, leaves an in-flight upload alone, and reports 0 the second time — the job's schedule
and command are asserted from `cron.job`; deleting a document a job references leaves the job with
the reference cleared; user B cannot delete user A's document, and A's object survives.
`tests/server/storage-guards.test.ts` asserts no SQL in any migration or source file deletes from
`storage.objects` and no foreign key references the `storage` schema.

**Status:** ready-for-review
