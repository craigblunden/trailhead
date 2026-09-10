# 01: Provision the stack and record the environment contract

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

## What to build

A running Supabase project and Vercel project that a developer can point a clean clone at, plus an
`.env.example` naming every variable the app needs. Nothing here is a decision — those were made in
the wayfinder tickets. But no ticket after this one can name an environment variable it has never
seen, and three load-bearing assumptions need testing against a real project rather than a doc.

The agent drives what it can and hands the user a precise checklist for anything needing a dashboard
login.

**Two roles, both `NOBYPASSRLS`.** `trailhead_migrator` owns the schema and connects in session mode
on 5432 (`DIRECT_URL`); `trailhead_app` runs the application and connects through Supavisor in
transaction mode on 6543 (`DATABASE_URL`). Supabase's own Prisma quickstart creates the app role
`with … bypassrls`, which leaves every policy in ticket 04 inert while appearing to work. Getting
this wrong is silent, and only ticket 04's cross-user test would catch it.

## Verify, do not assume

Three items are flagged unverified in the research and must be tested against the real project:

- **Does `allowed_mime_types` fire on a `PUT` to a signed upload URL?** This is the load-bearing one.
  Uploads go browser-direct, so no application code ever sees the bytes — bucket-level
  `allowed_mime_types` and `file_size_limit` are the *only* thing enforcing PDF/DOCX-only. If it does
  not fire on that path, ticket 15 needs a different answer and this ticket must say so.
- **Does Supabase Cloud override the 60 s default signed-upload-URL TTL?** The value comes from
  `UPLOAD_SIGNED_URL_EXPIRATION_TIME`; whether the hosted platform exposes it is unconfirmed.
- **Is `trailhead_app` genuinely `NOBYPASSRLS`?** Check the catalog, not the migration you wrote.

## Acceptance criteria

- [ ] Supabase project exists with Postgres, Auth, and Storage enabled, and `pg_cron` installed
- [ ] Both roles exist and `rolbypassrls` is false for each, confirmed by querying `pg_roles`
- [ ] A private bucket exists with `allowed_mime_types` restricted to PDF and DOCX, and
      `file_size_limit` set to the 5 MB per-file cap
- [ ] The `allowed_mime_types` question above is answered by an actual `PUT` of a disallowed type to a
      signed upload URL, and the result is recorded in this ticket
- [ ] The signed-upload-URL TTL question is answered and the observed value recorded
- [ ] Vercel project and environments exist, with an Anthropic API key scoped to this project
- [ ] `.env.example` lists every variable with placeholder values and no real secret, and `.env*` is
      git-ignored apart from it
- [ ] The `GRANT`s on `storage.objects` are defined once here, so tickets 04 and 15 do not each invent
      their own assumption
