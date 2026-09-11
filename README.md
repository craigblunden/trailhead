# Trailhead

A job-application tracker for one job seeker running 5–30 applications at once — every role from
first spark to signed offer, on one board. Accounts, a private database per user, the people in the
search, the documents that go out with each job, and cover letters written from them.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query ·
Supabase (Postgres, Auth, Storage) · Prisma 7 · `@anthropic-ai/sdk` (`claude-opus-5`) · Vercel

## Getting started

The whole stack runs locally through the Supabase CLI on Docker. From a clean clone:

```bash
npm install
npm run supabase:start       # Postgres, Auth, Storage, Mailpit
cp .env.example .env.local   # the local values are already filled in
npm run db:deploy            # the application's migrations
npm run dev
```

Then open http://localhost:3000. Verification and password-reset mail arrives in Mailpit at
http://127.0.0.1:54324. Cover letters need an `ANTHROPIC_API_KEY` in `.env.local`; without one the
card says generation is unavailable and everything else works.

`docs/provisioning.md` covers the hosted Supabase and Vercel projects and everything only a
dashboard can do.

## Testing

```bash
npm test                   # Vitest unit + component (jsdom). No database.
npm run test:integration   # Vitest against the local stack: data layer, policies, Storage, the quota
npm run test:e2e           # Playwright: builds, serves on :3100, starts a fake Anthropic API, runs
npm run verify             # lint + typecheck + unit + integration + e2e — what CI runs on every push
```

Integration and e2e tests need the local stack running (`npm run supabase:start`). Every e2e test
creates its own account; the run removes the accounts it created from the local stack when it ends.
jsdom cannot judge layout or computed colour, so contrast, horizontal overflow, and real focus order
are asserted in `e2e/`.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/signup`, `/login` | Create an account (with email verification), sign in — email or Google/GitHub |
| `/forgot-password`, `/reset-password` | Request and use a password reset link |
| `/board` | The board across five stages, and the "Add a job" dialog |
| `/board/[id]` | A job: description, notes, stage and history, contacts, application kit, cover letter |
| `/contacts`, `/contacts/[id]` | The people in the search, and every role each one is part of, grouped by stage |
| `/documents` | Resumes and cover letters on file (up to three), upload and delete |
| `POST /api/jobs/[id]/cover-letter` | Writes a cover letter from the job and its attached resume |

## Where things live

```
src/app/                  Routes. (auth) is the signed-out shell; (app) the signed-in one.
src/components/           UI: board/, job/, contacts/, documents/, auth/, landing/, ui/ (shadcn).
src/lib/                  Shared types, rules, and constants — importable on both sides.
src/server/actions/       Server Actions: validate, call the data layer, translate. No queries.
src/server/data/          The data access layer: session first, withTenant(), owner in every where.
src/server/db/            Prisma client, the tenant transaction, mappers from rows to DTOs.
src/server/ingest/        Text extraction at upload (unpdf, mammoth).
src/server/generation/    The Claude call and the one place its prompt is assembled.
prisma/                   Schema and migrations (tables, row-level security, the document sweep).
supabase/                 Local stack config and the provisioning migration (roles, bucket, cron).
tests/                    Vitest: unit, component, and integration (tests/integration/).
e2e/                      Playwright specs.
CONTEXT.md                The glossary. A Contact is user-owned; the record is a Job.
docs/                     Provisioning, what this work superseded, and what was deferred.
```

## Design system

All colour, radius, and illustration values are CSS custom properties in `src/app/globals.css` — the
page wash `scene-wash` and the SVG in `trail-scene.tsx` read from the same tokens, so retheming
happens in one file.

Text colours are tuned to clear WCAG 2.1 AA (4.5:1). Note that `--eyebrow` is deliberately darker than
the source mock, which did not meet AA at 12px.

## Decisions and deferrals

- `docs/supersedes.md` — which requirements of the Phase-1 and Phase-2 specs this work replaced, and
  with what.
- `docs/deferred.md` — what was deliberately not built, starting with gap analysis and the portfolio
  review, with their open questions.
- `.scratch/trailhead-build/` — the tickets this was built from, each with a record of what was done.
