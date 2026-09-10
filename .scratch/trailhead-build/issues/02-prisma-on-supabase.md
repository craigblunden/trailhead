# 02: Prisma 7 talks to Supabase

**Status:** ready-for-agent

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
