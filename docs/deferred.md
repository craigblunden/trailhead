# Deferred work

What this phase deliberately did not build, each with the reason and — where one exists — the
questions a future phase has to answer first. Decisions, not oversights (ticket 21).

## Gap analysis and the portfolio review — the headline ask, deferred

The original brief's headline was: *"if we see lots of requests for proof of work and none are listed,
highlight that with some sample projects."* It is not in this phase. The user paused it twice, in order:

> *"lets pause the extraction taxonomy, we can focus on portfolio improvements in a future phase"*

> *"lets keep it relatively simple for the minute, the feature I want to keep is taking a resume and a
> job description and producing a cover letter … lets pause the part where we check all job
> applications as part of an advisement feature"*

**What left the phase:** the Requirement/Evidence extraction taxonomy (job descriptions parsed into
typed Requirements, documents into typed Evidence, a Gap being a Requirement with no matching
Evidence); per-job gap analysis and the `Analysis` entity with its staleness rules and re-run
affordance and its job states; and the portfolio review — the cross-job pass, its "twice per user per month" trial quota, its staleness hint, and the suggested sample
projects. The two are entangled: structured extraction existed largely to make the portfolio pass a
query rather than an inference call. The glossary terms `Requirement`, `Evidence`, `Gap`,
`Analysis` and `Portfolio review` remain in `CONTEXT.md` for when this returns. `Stale` no longer
waits with them: a **Footing** uses it now, unchanged.

**What shipped instead, and what it does not close.** A **Footing** (`CONTEXT.md`, **ADR-0007**) scores
a posting against an Application kit through TypeSafe's `score` primitive, which needs none of the five
questions below — nothing is parsed into typed things on either side. It ships *instead of nothing*, not
instead of this. A Footing finds no Gaps, cites nothing, and cannot say why, so the motivating sentence
about proof of work is still unwritten; what it does give is a **Footing dimension per Job as a stored
row**, which makes the aggregate half of the portfolio pass a query, which is the property structured
extraction was mostly wanted for. If this work returns, it returns for the per-Job explanation — the
Gap, and what to add — and every question below is still open and still first.

**Open questions — nothing below was answered. Start here.**

- **The Requirement types.** `proof_of_work` must be its own category or the motivating sentence
  cannot be produced. What else — `skill`, `credential`, `years_experience`, `domain`, `location`,
  `authorization`? Where does the list stop, and what happens to a requirement fitting none of them?
- **Requirement strength.** "Required" versus "preferred" decides whether a gap is disqualifying or
  cosmetic. Is it a field, and can it be extracted reliably?
- **What matching means.** "React" against "React 18 at Fernwood" matches; "5 years" against "3 years"
  does not. Does the model decide at analysis time and store a verdict, or is it computed in SQL from
  normalised values? Very different costs.
- **Normalisation.** "JS", "JavaScript", and "ES6" are one skill. Without it the aggregation counts three
  and the headline sentence is quietly wrong.
- **The schema handed to Claude** through `output_config.format`, and what happens when extraction
  returns something outside it.

**Constraints already established that this work inherits:**

- Evidence provenance must be a schema field. Citations return page numbers — the provenance Evidence
  wants — but citations and `output_config.format` are mutually exclusive, so provenance has to be
  something the model fills in (a quoted span, a section label).
- One evaluation settles what the documentation cannot: on layout-heavy resumes (two columns, tables,
  sidebars), does handing Claude the PDF itself beat extracted text? Extraction flattens layout, and a resume's layout carries meaning. This phase extracts text at
  upload (ticket 15) and dropped the direct-PDF fallback on cost (ticket 19); the evaluation could
  reopen that.
- No queue exists. A manual, low-frequency portfolio pass fits the Message Batches API (half the cost,
  no new data processor) better than a background worker.

## Smaller deferrals

| Deferred | Why | What picking it up involves |
| --- | --- | --- |
| **Streaming the generated letter** as it is written | The letter is 250–400 words and arrives in 10–25 s behind an honest waiting state | The generation Route Handler returns a stream instead of JSON; its callers do not change shape, which is why this was cheap to postpone |
| **Dark mode** | Open since Phase 1 | Colour tokens are centralised in `src/app/globals.css`; contrast (A11Y-3) must be re-proven for a second palette |
| **Removing orphaned objects for users who never return** — and two cases after Account deletion: a file uploaded through a signed upload URL minted before deletion (tokens live 2 h), and an upload from a second tab whose access token outlived the Account | Removing a Storage object takes the owner's session; no `service_role` key exists by design (tickets 15, 16; ADR-0004). The janitor keeps such a file's Document row as the only record of it | A server-side job with a narrowly scoped credential, e.g. `pg_net` from `pg_cron` with a key in Vault — a reversal of "no `service_role` anywhere", so a decision first |
| Teams, sharing, multi-user tenants | Tenancy means isolation, never collaboration | Out of scope by definition |
| Agency as a record; document versioning | Decided against for this phase (`CONTEXT.md`, tickets 14, 18) | Each is a glossary change before it is a schema change |
| ~~Storing generated letters~~ | Reversed by ADR-0002: a Job keeps its last **Draft** so a Rewrite has a trusted starting point | — |
| Data export | Not in this phase; Documents already download one at a time. Account deletion shipped without it (`.scratch/trailhead-account`) | One read of every tenant table and a signed link per file, as the user, bundled for download |
| Charts | Nothing needs one | Recharts via shadcn/ui is the standing choice |
| **Reading Rejection letters** against the cover letter and job description sent | A Rejection letter is kept for reference only, for now. Undecided whether this becomes a per-Job pass, like an Analysis, or an input to the Outcome review, which today reads Application kits and Stages and never text | A glossary decision first: which of the two it is, and whether a Rejection letter can go stale the way an Analysis does |

## Verified only locally — for the first hosted deployment

- **The live Anthropic API.** No key was available while building; generation is tested against a
  fake of the Messages API and a local server. The first hosted run is the smoke test, in particular
  that `fallbacks: "default"` (server-side refusal fallback) is accepted for the account.
- **Hosted Supabase behaviour** that ticket 01 verified only on the local stack: the signed upload URL's
  lifetime, and the bucket limits on the signed-upload path (`docs/provisioning.md` lists the probes).
- **Social sign-in against real providers** (ticket 07).
- **CI on a Linux runner** — see `.github/workflows/verify.yml` and ticket 21's note about the test-only
  OAuth provider reaching the Auth container.
