# 03: One Job cache module owns every write to a Job in the browser

**Status:** ready-for-agent

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

- [ ] A refused notes, description, or salary edit, or a refused Stage move, restores only the fields it changed. A kit choice and another Job's edit made while it was in flight both survive, proven by tests.
- [ ] A refused kit choice still rolls back only its own slot (KIT-9 still passes).
- [ ] Linking, unlinking, and create-and-link from a Job cancel in-flight reads of the Jobs list before swapping in the server's Job, like every other write.
- [ ] Nothing outside the module writes the Jobs list in the cache. The server prefetch and the test harness only seed it.
- [ ] The module is tested through its interface against a real query client, without rendering, including the races above.
- [ ] The existing board, job page, Application kit, and Contacts component tests pass, and so does the e2e journey.
