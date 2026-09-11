# 03: One Job cache module owns every write to a Job in the browser

**Status:** ready-for-review

**Blocked by:** 01, 02

## What to build

Four places write the list of Jobs in the client cache, and each has its own policy:

| Writer | Optimistic | On failure | Cancels in-flight reads |
| --- | --- | --- | --- |
| The job store (edits, Stage moves, adding a Job) | yes | restores a snapshot of the **whole list** | yes |
| Application kit choices | yes | rolls back its own slot, only if the slot still holds its choice | yes |
| Contact links (link, unlink, create-and-link) | no | swaps in the server's Job | no |
| Deleting a Document, editing a Contact | no | invalidates only | no |

What goes wrong because of this:

- A refused notes edit briefly undoes a kit choice or another Job's edit made while it was in flight, until the refetch lands.
- The cover-letter card reads the Job's resume directly, so it can flicker to "Attach a resume".
- "Roll back only your own change" was fixed in the kit's second review, and it holds for the kit alone.
- Drag-and-drop between board columns (deferred) would add a fifth writer.

After this ticket, one module takes every change to a Job: an edit, a Stage move, a kit slot, the server's copy of a Job. It owns:

- cancelling in-flight reads
- applying the optimistic change, using the whole-Job rules from ticket 02
- rolling back only the fields that change touched, and only if they still hold its value
- swapping in the server's Job
- the failure message (ticket 01's rule)
- the resync

The job store, the Application kit, and Contact links become callers. A caller may still choose not to be optimistic, as Contact writes are today. The rollback and swap-in rules are not a caller's choice.

## Acceptance criteria

- [x] A refused notes, description, or salary edit, or a refused Stage move, restores only the fields it changed. A kit choice and another Job's edit made while it was in flight both survive, proven by tests.
- [x] A refused kit choice still rolls back only its own slot (KIT-9 still passes).
- [x] Linking, unlinking, and create-and-link from a Job cancel in-flight reads of the Jobs list before swapping in the server's Job, like every other write.
- [x] Nothing outside the module writes the Jobs list in the cache. The server prefetch and the test harness only seed it.
- [x] The module is tested through its interface against a real query client, without rendering, including the races above.
- [x] The existing board, job page, Application kit, and Contacts component tests pass, and so does the e2e journey.

## Comments

### 2026-09-11 — agent

**Built: `src/components/job-cache.ts`.** `jobCache(queryClient)` has three methods:

- **`update(jobId, { apply?, send, fallback })`** covers every change to one Job. It never throws: it resolves `{ ok: true, job }`, or `{ ok: false, message }` with the change already rolled back.
- **`add(build, { send, fallback })`** adds a new Job. It is built from the list as it stands when shown, so the accent round-robin reads the current count.
- **`refresh()`** is for a change made elsewhere: a Document deleted, a Contact renamed.

What is in flight is tracked per query client:
- **Held fields:** while a write is on its way, its fields keep that write's value when another write's server copy is swapped in. So a notes save answering first no longer overwrites a kit pick still in flight.
- **One resync:** the list is invalidated once, when the last write settles, so a refetch cannot land over a change still on its way. A `refresh()` during writes waits for that resync.

The callers:
- The job store, `useJobDocuments`, and `useJobContactLinks` go through `update`, and adding a Job goes through `add`.
- Document delete and Contact edits call `refresh()`.
- Contact writes stay non-optimistic (no `apply`), but now cancel in-flight reads and respect held fields like every other write.
- The kit keeps its React `picked` state, so the radio still moves within the click.
- `replaceJob` is gone.

**Found while building it:** TanStack's structural sharing stores a copy of any array or object that changed. So "does the field still hold this change's value" cannot compare against `apply`'s own result: a Stage move's Activity array never matched, and was not rolled back. The module compares against the value the cache actually stored. CACHE-2 caught it.

**The timing call:** `cancelQueries` is not awaited before the change is shown. In `@tanstack/query-core`, writing during a read also moves the state that read reverts to (`#revertState = action.manual ? newState : …`), so showing in the same tick is safe. It keeps a radio or select from lagging behind the click.

**Tests:** `tests/components/job-cache.test.ts`, with a real query client, no rendering, and requests settled by hand.
- **CACHE-1:** a refused notes, description, or salary edit restores only that field, and a kit choice made meanwhile survives.
- **CACHE-2:** a refused Stage move restores its Stage, applied date, and Activity, and another Job's edit survives.
- **CACHE-3:** a refusal leaves a later change to the same field alone.
- **CACHE-4:** the failure message is the field's, then the action's, then the fallback.
- **CACHE-5:** a swap-in keeps held fields.
- **CACHE-6:** a write with no `apply` (a Contact link) cancels a read in flight before swapping in.
- **CACHE-7:** adding a Job, refused and accepted.
- **CACHE-8:** the list resyncs once, and not while a write is on its way.
- **CACHE-9:** no file under `src/` but this module calls `setQueryData`, `cancelQueries`, `invalidateQueries`, `refetchQueries`, `resetQueries`, or `removeQueries` on the jobs key.

The board, job page, Application kit (KIT-7, KIT-9), Contacts, and jobs-provider (TSQ-4, TSQ-5) component tests pass.

**Verified:** typecheck, lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests, including `journey.spec.ts` and `phase-journey.spec.ts`. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation on an `opacity-60` chip in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
