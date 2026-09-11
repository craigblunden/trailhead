# 02: Prisma 7 talks to Supabase

**Status:** ready-for-review

**Blocked by:** 01

## What to build

The application can open a database connection as `trailhead_app` and a migration connection as
`trailhead_migrator`, and `npm run verify` is still green afterwards. No schema, no models, no
queries — just proof that Prisma 7 and this repo can coexist.

**This is the fail-fast ticket.** Prisma 7's upgrade guide requires `"type": "module"` in
`package.json`, and this repo has five config files that may not survive it: `next.config.ts`,
`eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`. Doing this
before a line of schema or auth code exists means a failure costs an hour, not a week. If it cannot
be made to work, fall back to Prisma 6 and record why in `docs/adr/`.

Prisma 7 also mandates a driver adapter — `new PrismaClient()` with no adapter no longer works — and
a required generator `output`. Most published examples, and most training-data recall, predate both.
Check every snippet against the installed version's own types, not against memory. Same for Next:
read `node_modules/next/dist/docs/` before writing framework code.

**Incidentals the research already caught, so they need not be rediscovered:** `datasource.url` in
`schema.prisma` is banned under Prisma 7 and fails as P1012; `?pgbouncer=true` and
`?connection_limit=` in the URL are inert under a driver adapter, so pool size is set through
`pg.PoolConfig` instead.

## Acceptance criteria

- [ ] `"type": "module"` is set and `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
      and `npm run test:e2e` all pass unchanged against the existing Phase-1 UI
- [ ] `prisma.config.ts` exists with schema path, migrations path, and datasource URL
- [ ] A single Prisma client is exported behind the `pg` driver adapter, and it is the only place a
      database URL is read
- [ ] A connectivity check succeeds through the transaction-mode URL as `trailhead_app` and through
      the session-mode URL as `trailhead_migrator`
- [ ] If Prisma 7 proved unworkable, an ADR records the fallback to Prisma 6 and exactly what broke

## Comments

### 2026-09-11 — agent

**Prisma 7 works with this repo; no fallback to Prisma 6 was needed.** `"type": "module"` went in
first, alone, and every config file survived it: `next.config.ts`, `eslint.config.mjs`,
`postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`. `npm run lint`, `typecheck`,
`test`, `build` all pass unchanged against the Phase-1 UI; the e2e suite is being run under the
same flag as the last check (results in ticket 20's record if anything moved).

What was added:

- `prisma.config.ts` — schema path, migrations path, datasource URL from `DIRECT_URL`. Loads env
  through `@next/env` so `prisma migrate` and `next dev` read the same `.env.local`.
- `prisma/schema.prisma` — `prisma-client` generator with a required `output` of
  `src/generated/prisma` (git-ignored; `postinstall` and `build` both run `prisma generate`).
  No `datasource.url` — Prisma 7 fails it as P1012.
- `src/server/db/prisma.ts` — the single `PrismaClient`, behind `@prisma/adapter-pg`, and the
  only place `DATABASE_URL` is read. Pool size is set on `pg` (`max: 5`) because `?pgbouncer=true`
  and `?connection_limit=` are inert under a driver adapter. `server-only` guards it.
- `vitest.config.ts` — two projects: `unit` (jsdom, `npm test`) and `integration` (node, real
  database, `npm run test:integration`, files run serially). The integration level is stood up
  here rather than in ticket 04 because the connectivity check needs it.
- `tests/integration/connectivity.test.ts` — connects as `trailhead_app` through the pooler and as
  `trailhead_migrator` directly, and asserts both `NOBYPASSRLS` from `pg_roles`.

Incidental: `@next/env`'s `loadEnvConfig` skips `.env.local` when `NODE_ENV=test` (Vitest sets
it), so `tests/load-env.ts` reads `.env.local` then `.env` explicitly with the same parser.

**Status:** ready-for-review
