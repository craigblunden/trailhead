# Trailhead Build — the merged implementation set

**Created:** 2026-09-10
**Supersedes as ticket sets:** `.scratch/trailhead-backend/issues/` and
`.scratch/trailhead-phase3/issues/`

## What this is

One continuous ticket set taking Trailhead from the Phase-1 UI prototype to a durable, private,
multi-tenant application with contacts, documents, and cover-letter generation.

It exists because Phase 2 and Phase 3 stopped being two efforts. Phase 2 was specced but never built —
the repo is one commit, with no `src/server/` — and Phase 3's wayfinder decisions voided roughly a
third of it before a line of it was written. Keeping them apart preserved a boundary that no longer
existed.

**The two source efforts stay intact as the decision record.** Nothing here re-litigates them:

- `.scratch/trailhead-backend/spec.md` — the Phase-2 spec, with its requirement IDs. Still the best
  statement of the layering rules and the data model, minus the auth surface.
- `.scratch/trailhead-phase3/map.md` and its `issues/01`–`12` — the resolved decisions this set
  implements, each with its reasoning.
- `.scratch/trailhead-phase3/research/` — five research files with findings verified against installed
  packages and source, not docs alone. Read these before re-deriving anything.

## What Phase 2 specced and this set does not build

Recorded here so it is not rediscovered as a gap. Ticket 21 writes it into the specs themselves.

| Phase-2 item | Why it is gone | Decided by |
| --- | --- | --- |
| The entire `better-auth` surface | Auth is Supabase Auth | phase3/02 |
| Prisma managing the auth schema | Supabase Auth owns it | phase3/02 |
| The frozen `JobsProvider` contract | TanStack Query owns client state; consumers may change | phase3/08 |
| "The diff touches no consumer component" | Same | phase3/08 |
| `refresh()` after every mutation | Duplicated work once TanStack owns job state | phase3/08, 09 |
| The deployment-target question | Vercel and Supabase | phase3/01 |

What survives in substance rather than mechanism: `requireSession()` memoised per render, no `userId`
accepted from a caller, `proxy.ts` as an optimistic redirect that is explicitly not an authorization
boundary, and optimistic update with visible rollback.

## Out of scope, deliberately

- **Gap analysis and the portfolio review** — the Requirement/Evidence taxonomy and suggested sample
  projects. This was the *headline ask* in the original brief. Deferred, not decided against; see
  `.scratch/trailhead-phase3/issues/12-analysis-deferred.md`, which preserves its open questions.
- **No queue.** No pgmq, no queue table, no worker, no job-state model. `pg_cron` runs the storage
  sweep and nothing else. Generation and ingestion run in-request.
- **Streaming the generated letter.** A Route Handler upgrades to streaming without changing its
  callers, so this is a cheap later improvement rather than an oversight.
- **Charts.** Recharts via shadcn/ui is the standing choice if one is ever needed. Nothing here needs
  one; do not install it.
- Teams, sharing, multi-user tenants. Tenancy here means isolation, never collaboration.
- Agency as a first-class entity. Document versioning. Generated letters as stored Documents.
- Account deletion and data export.
- Drag-and-drop between columns and dark mode — open since Phase 1, still open.

## Dependency graph

```
01 Provision the stack ──┐
                         └── 02 Prisma 7 on Supabase
                              └── 03 Schema + first migration
                                   ├── 04 Tenant isolation, proven ── 05 Accounts ──┬── 06 Reset password
                                   │                                                ├── 07 Social sign-in
                                   │                                                │
                                   └── 08 Validation + mappers ─────────────────────┤
                                                                                    │
09 TanStack Query prefactor ────────────────────────────────────────────────────────┤
                                                                                    │
                                            10 Board reads + add persists ──────────┘
                                             └── 11 Detail + stage/notes persist
                                                  ├── 12 Error handling + fixtures
                                                  ├── 14 Contacts user-owned
                                                  └── 15 Upload a resume
                                                       ├── 16 Delete a document
                                                       ├── 17 Pick a document for a job
                                                       └── 18 Generate a cover letter (+ quota)
                                                            └── 19 Failure paths
13 UI surfaces prototype ──▶ gates 14, 15, 17, 18

                    12 + 14 + 17 + 19 ──▶ 20 E2E + accessibility ──▶ 21 verify + CI + Supersedes
```

## Parallelisation

Three tickets are unblocked on day one: **01** (provisioning, which the whole database branch waits
on), **09** (the TanStack prefactor, pure client work against fixtures), and **13** (the UI
prototype, which gates every Phase-3 feature ticket and is a decision, not code).

**08** runs alongside the entire auth branch — it depends only on the schema's enum names.

Must be sequential: 01 → 02 → 03; 10 → 11; anything touching `schema.prisma`.

## Where the open decisions went

The wayfinder set kept design questions as standalone tickets. Here each is folded into the slice that
needs it, so it cannot be deferred into nothing:

| Question | Now decided in |
| --- | --- |
| Contact field list, required/optional, how "last spoken" is set | 13, built by 14 |
| Document picker vs. dropzone, how the 3-cap is expressed | 13, built by 15 and 17 |
| Generation waiting state and at-quota state | 13, built by 18 |
| What the generation prompt receives | 18 |
| Quota limit, window, counter location, whether failures burn it | 18 |
| Whether the direct-PDF fallback is kept | 19 |
| Whether an unextractable document stays or is swept | 19 |
| Whether the board surfaces anything new | 13 |

## Before starting any ticket

- `CONTEXT.md` at the repo root is the glossary. Use its terms; do not drift to the synonyms it lists
  under _Avoid_. Two that matter most: a **Contact** is user-owned and "recruiter" is a *kind* of one;
  and the record is a **Job**, never an "application".
- **Read `node_modules/next/dist/docs/` before writing any Next.js code.** This version has breaking
  changes from training data — middleware is renamed to `proxy.ts`, among others.
- Read the `claude-api` skill before writing any Claude call.
- Check Prisma and Supabase snippets against installed types, not memory. Prisma 7 broke most published
  examples.
