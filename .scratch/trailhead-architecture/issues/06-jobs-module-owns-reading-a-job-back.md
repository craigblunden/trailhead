# 06: The jobs data module owns reading a Job back

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

## What to build

Several data modules return a Job after a write: linking, unlinking, and creating a Contact from a Job, and attaching a Document. Generation also reads a Job to write from. Each of these modules:

- checks by hand that the Job belongs to the Tenant
- when it returns a Job, imports the jobs module's query shape and the Job mapper

The row type is defined apart from the query shape it describes. Adding a relation to a Job would mean editing the query shape, the row type, and the mapper, and then checking every module that reads a Job back. Gap analysis's Analysis is the first expected relation, when that work returns.

After this ticket, the jobs data module offers two reads inside a tenant transaction:

- "this Job is yours", or a `NotFoundError`
- "this Job as the board sees it"

The query shape and the row type stay inside the jobs data module.

These decisions still hold:

- No data function accepts a `userId` from its caller (enforced by the boundaries test).
- Every `where` still names the owner.
- External calls never run inside a tenant transaction.
- The lock between attaching and deleting a Document is unchanged.

## Acceptance criteria

- [ ] The Contacts, Documents, and generation data modules no longer import the Job query shape or map Job rows themselves.
- [ ] The ownership check for a Job is written once.
- [ ] The boundaries test passes unchanged: no data function takes a `userId`.
- [ ] The cross-Tenant integration tests pass unchanged, for jobs, Contacts, Documents, a Job's Documents, and generation.
- [ ] The attach-versus-delete race test still passes.
