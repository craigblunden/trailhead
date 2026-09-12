# What this work superseded

The record of which requirements from the two earlier specs stopped being true, and what replaced
each one (ticket 21). A requirement that quietly stopped being true is worse than one that was never
written, so nothing below was deleted without a line saying what took its place.

**Where the specs are.** Neither spec is in the working tree, which is why this record is a document
of its own rather than a section appended to each:

- **Phase 1** — `docs/spec.md`, the UI prototype's spec. Removed in commit `2aebb4f`; read it with
  `git show 9045d87:docs/spec.md`. Requirement IDs below (`AUTH-3`, `DET-7`, …) are its IDs.
- **Phase 2** — `.scratch/trailhead-backend/spec.md`, the backend spec. It was never committed to
  this repository. What it decided is summarised in `.scratch/trailhead-build/map.md`, and the
  phase-3 decisions that voided parts of it are cited below.

The merged implementation set is `.scratch/trailhead-build/issues/01`–`21`; ticket numbers below are
from it.

## Phase 1 — the UI prototype

| Phase-1 requirement or statement | Status | Replaced by |
| --- | --- | --- |
| Objective: "This phase ships the interface only. There is no backend, database, or authentication." | **Void** | Postgres on Supabase through Prisma 7, with row-level security on every table (01–04); Supabase Auth (05–07) |
| **AUTH-3**: "Submitting either form navigates to `/board`. No credentials are checked — this is a prototype seam." | **Void** | Sign-up with email verification, sign-in, sign-out (05); forgotten and reset password (06); social sign-in with account linking (07). `proxy.ts` redirects optimistically; pages and the data layer check the session |
| Out of scope: "persistence across reload" — the open question of how state survives | **Answered** | Straight to a real backend. No interim browser storage was built. Jobs, stages, notes, contacts, documents, and the generation quota persist in Postgres (10, 11, 14–18) |
| Board state "lives in React context seeded from fixtures"; `src/lib/jobs.ts` holds "seed fixtures" | **Void** | TanStack Query holds client state over Server Actions (09–11). The seven seed jobs are test fixtures in `tests/fixtures/jobs.ts`, unreachable from `src/` (enforced by `tests/server/fixtures-boundary.test.ts`); **new accounts start empty** (12) and BOARD-5's empty state is the first-run screen |
| **DET-6**: "Editing description or notes updates the shared store" | **Superseded** | Edits save to the server on a pause or on blur and survive a reload; a refused edit rolls back visibly (11) |
| **ADD-5**: "Choosing a resume file records its filename and swaps the dropzone for a removable chip." Out of scope: "real resume upload (the dropzone records a filename only)" | **Void** | Real upload of PDF and DOCX, browser-direct to a private bucket, with text extracted at upload (15). The add-job dialog asks for no file; a document is attached from the job page's application kit (17) |
| **ADD-6**: "…and reset any staged resume" | **Partly void** | Cancel and close still dismiss without adding anything; there is no staged resume to reset |
| **DET-1**: "…applied/added date, and resume filename" | **Superseded** | The attached resume and cover letter are shown and chosen in the job page's application kit (17), not in the Details card |
| **DET-7**: "The add-contact control is disabled until there is somewhere to persist a contact." Out of scope: "adding/editing contacts" | **Real** | Contacts are user-owned and linked to many jobs; the job page links search-first and creates with name and kind; each contact has its own page grouping its roles by stage (14) |
| **DET-9**: "The cover-letter action is present but disabled and labelled 'coming soon'." Out of scope: "cover-letter generation" | **Real** | Cover letters written by `claude-sonnet-5` from the job description and the attached resume, through a Route Handler, under a quota of five a week, with every failure explained (18, 19) |
| Out of scope: "form validation beyond native HTML constraints" | **Real** | Every input is validated and bounded on the server (08, 14, 15) |
| README: "`src/components/jobs-provider.tsx` is the only place that owns job state. Replacing its body with real fetching/mutations leaves every consumer unchanged." | **Void** | TanStack Query owns job state; consumers were free to change and did (09) |
| Out of scope: drag-and-drop between columns; dark mode as a shipped feature | **Still deferred** | See `docs/deferred.md` |

Every other Phase-1 requirement — the stage model and formatting (DATA-1…10), the landing (LAND-1…3), the auth forms' fields and links (AUTH-1, AUTH-2, AUTH-4),
adding a job (ADD-1…4), the board and cards (BOARD-1…6, CARD-1…5), stage changes and their history (DET-2…5, DET-8, DET-10,
DET-11), accessibility (A11Y-1…5), and responsiveness (RESP-1, RESP-2) — still holds and is still
tested, now against a real account with data each test creates. **One exception today:** RESP-1 fails
on the committed landing page at 320px, in its "Everything you need for the climb" section, which predates
this work; the landing rewrite in progress replaces that section.

Also superseded, from the Phase-1 spec's Boundaries and success criteria, each replaced as above:
"Keep `JobsProvider` the only owner of job state" and "swapping its body requires no changes to any
consumer" (TanStack Query owns job state, 09); "introducing persistence or a backend" and "wiring a real
credential check into the prototype auth forms" as things this phase must not do (they are now the
point, 01–07); and the Commands line `verify # lint + typecheck + unit + e2e`, which also runs the
integration level now.

## Phase 2 — the backend spec

| Phase-2 item | Status | Replaced by | Decided by |
| --- | --- | --- | --- |
| The entire `better-auth` surface (its tables, its session handling, its sign-in and sign-up flows) | **Void** | Supabase Auth: `@supabase/ssr` cookies, `getUser()` validation in `requireSession()`, email verification, reset, social providers (05–07) | phase3/02 |
| Prisma managing the auth schema | **Void** | Supabase Auth owns the `auth` schema; Prisma's schema models no users, and every row's owner is a Supabase user id (03) | phase3/02 |
| The frozen `JobsProvider` contract | **Void** | TanStack Query owns client state; the provider became a thin layer over it and consumers may change (09) | phase3/08 |
| Success criterion: "the diff touches no consumer component" | **Void** | Same | phase3/08 |
| Rule: call `refresh()` after every mutation | **Void** | Optimistic cache updates with rollback, the server's answer written into the cache, and invalidation where other queries are affected (09–11, 14, 17) | phase3/08, 09 |
| The deployment-target question | **Answered** | Vercel for the application, Supabase for Postgres, Auth, and Storage (01; `docs/provisioning.md`) | phase3/01 |
| Tenancy by convention in application queries | **Strengthened** | Row-level security, forced, on every table, over a transaction-local tenant setting (`withTenant()`), with write checks that refuse references to another tenant's rows; the application still names the owner in every query (04) | phase3/03 |

**What survived in substance, not in mechanism:** `requireSession()` memoised per render; no function
in the data layer accepts a `userId` from its caller (enforced by `tests/server/boundaries.test.ts`);
`proxy.ts` as an optimistic redirect that is explicitly not an authorization boundary; optimistic
updates with visible rollback; and the cross-user guard (Phase-2 SEC-1, T-6, T-7) — every data-layer
module has integration tests against the real database proving a second user cannot reach the
first user's rows through it.
