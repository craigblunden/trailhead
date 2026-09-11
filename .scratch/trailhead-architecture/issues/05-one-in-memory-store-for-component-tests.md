# 05: One in-memory store serves Jobs, Contacts, and Documents in component tests

**Status:** ready-for-review

**Blocked by:** 02

## What to build

Component tests run the providers against three in-memory adapters, one per client interface. Each adapter keeps its own copy of the Jobs, and each re-creates server rules by hand:

- a Contact's "also on N other jobs"
- sort order
- a Document's kind check
- not-found messages

Linking a Contact or attaching a Document therefore changes a store the other two adapters never see. A test cannot follow a change from one entity to another. The Jobs adapter also still ships in production code, left over from the prototype.

After this ticket, one in-memory store satisfies all three client interfaces. It holds Jobs, Contacts, Documents, and the links between them, and it:

- lives with the tests
- applies the Job rules from ticket 02
- takes its messages from the same source the server uses

The client interfaces and the Server Actions adapters don't change. Each seam keeps its two adapters.

## Acceptance criteria

- [x] One store backs all three client interfaces in the component test harness.
- [x] In a single test:
  - attaching a Document shows on the Job and in the Document's "on N jobs"
  - linking a Contact shows on the Job and in the Contact's count of roles
- [x] Not-found and wrong-kind messages come from one source and match what the server's actions return.
- [x] No in-memory adapter remains in production code, and the fixtures boundary test still passes.
- [x] Every existing component test passes. The only ones rewritten are those that built a fake by hand.

## Comments

### 2026-09-11 — agent

**Built: `tests/fakes/trail.ts`.** `createTrail({ jobs, contacts, documents })` returns `{ jobs, contacts, documents, jobsNow }`: three clients over one store, every method a `vi.fn`.

How it stores and derives:
- **Links:** Contacts on a seed Job become one Contact each, linked to every Job they appear on.
- **Derived, never stored twice:**
  - a Job's Contacts and their "other jobs" count
  - a Document's Jobs
  - a Contact's role count and its Jobs in pipeline order
- **Orderings:** `sortContacts` from the mappers.
- **Rules:** a new Job and a Stage move come from the Job rules (ticket 02).
- **Refusals** are thrown the way an action's result would be:
  - `NotFoundError.shown`, a new getter now used by `runAction` and the cover-letter route too
  - `WRONG_KIND_REFUSALS`, moved from the Document data module into `src/lib/documents.ts`
- **Ids:** counted per kind (`contact-1`, `document-1`), as the tests expected.

**The harness:** `renderWithJobs` takes a `trail` (built from `initialJobs` when not given) and seeds the cache from `trail.jobsNow()`. A test that needs failing writes can still pass its own jobs `client`.

**Deleted:**
- `createFixtureJobsClient`, from `src/lib/jobs-client.ts`, which now holds types only
- `tests/fakes/contacts-client.ts` and `tests/fakes/documents-client.ts`

**Fixture change:** four people in `SEED_JOBS` shared the contact id `c1`, which one store would have merged into one Contact. Harvest's Tom Okafor keeps `c1`, the id the tests use. Dana Whitfield, Ravi Menon, and Alex Chen are now `c3`, `c4`, and `c5`.

**Rewritten, because they built fakes by hand:**
- `jobs-provider.test.tsx`, `application-kit.test.tsx`, `contacts.test.tsx`, and `documents.test.tsx`
- DET-12 in `job-detail.test.tsx`

Assertions that relied on hand-set derived values now seed real data:
- CON-J1 links Jess to three Jobs instead of setting `otherJobCount: 2`.
- KIT-1, DOC-1, and DOC-6 attach the Document to real Jobs instead of setting `jobs` on its summary.

**New cross-entity tests:**
- **KIT-11:** choosing a resume checks it on the Job, and its label changes from "Not on any job yet" to "On 1 job".
- **CON-J8:** a Contact linked on the job page shows on the Job, and the contacts list rendered afterwards from the same store says "On 1 role".

**Verified:** typecheck, lint, 354 unit tests (FIX-1 and FIX-2 included), 88 integration tests, 83 of 84 e2e tests. The e2e failure is A11Y-1 on the landing page, a colour-contrast violation in "Everything you need", in files last changed by `a943576` that no architecture ticket touches.
