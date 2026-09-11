# 06: The jobs data module owns reading a Job back

**Status:** ready-for-review

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

- [x] The Contacts, Documents, and generation data modules no longer import the Job query shape or map Job rows themselves.
- [x] The ownership check for a Job is written once.
- [x] The boundaries test passes unchanged: no data function takes a `userId`.
- [x] The cross-Tenant integration tests pass unchanged, for jobs, Contacts, Documents, a Job's Documents, and generation.
- [x] The attach-versus-delete race test still passes.

## Comments

### 2026-09-11 — agent

**Built.**

- **`withTenant(userId, fn)`** now hands `fn` a second argument, a `Tenant`: `{ tx, userId }`, made only by `withTenant`.
  - A function that takes a `Tenant` can only be called from inside a tenant transaction the data layer opened, never with an owner a caller chose. That keeps the boundaries rule in substance.
  - Existing callbacks that take only `tx` are unaffected.
- **In `src/server/data/jobs.ts`:**
  - **`ownJob(tenant, jobId, select)`** returns the selected fields of the Tenant's Job, or `NotFoundError` for a missing id and a foreign one alike. It is the one ownership check.
  - **`readJob(tenant, jobId)`** returns the Job as the board sees it.
  - **`JOB_INCLUDE`** is no longer exported. `JobRow` stays in the mappers beside `toJobDto`, which consumes it.
  - **`updateJob`** uses `readJob`.
- **The callers:**
  - `linkContact`, `unlinkContact`, and `createContactForJob` use `ownJob` then `readJob`.
  - `setJobDocument` uses `ownJob`, then its `FOR UPDATE` lock on the Document in the same order as before, then the update, then `readJob`.
  - `coverLetterInputs` reads its fields through `ownJob`.
- **One cast:** Prisma cannot carry a generic `select` through to its result type, so `ownJob` casts its row to `Prisma.JobGetPayload<{ select: S }>`, with a comment. Every call site is typed exactly.

**Tests:**
- `tests/server/job-reads.test.ts`:
  - **JOBREAD-1:** no data module but jobs mentions `JOB_INCLUDE` or `toJobDto`, or calls `.job.findFirst`, `findUnique`, or `findMany`.
  - **JOBREAD-2:** `JOB_INCLUDE` is not exported.
- The boundaries test passes unchanged.
- The cross-Tenant and race tests in `jobs`, `contacts`, `documents`, `job-documents`, `generation`, and `tenant-isolation` pass unchanged. That includes the attach-versus-delete race, run 25 times.

**Verified:** typecheck, lint, 354 unit tests, 88 integration tests, 83 of 84 e2e tests. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
