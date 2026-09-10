# 16: Delete a document

**Status:** ready-for-agent

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
