# 01: Provision the stack and record the environment contract

**Status:** ready-for-review (hosted steps pending on the user)

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

## Comments

### 2026-09-11 — agent: what was done, what was verified, what needs a dashboard

**Built.** The stack is provisioned as code so a clean clone needs no account:

- `supabase/config.toml` — local stack: pooler on, `documents` bucket (private, 5 MiB, PDF/DOCX),
  email confirmations on, 8-character minimum, redirect allow-list for :3000 and :3100, Google and
  GitHub providers declared but off, keyed on the same env vars the app reads.
- `supabase/migrations/20260911000000_provision_trailhead.sql` — runs as `postgres` locally and via
  `supabase db push` on the hosted project: `pg_cron`; `trailhead_migrator` and `trailhead_app`
  (both `NOBYPASSRLS`, asserted with `alter role`); schema grants; bucket upsert; the three storage
  policies (select/insert/delete keyed on prefix **and** owner, no UPDATE policy); the janitor's
  cron schedule. **The `GRANT`s on `storage.objects` are stated once, here.**
- `supabase/seed.sql` — local-only development passwords for the two roles.
- `.env.example` — every variable, local values filled in, no secret. `.gitignore` excludes `.env*`
  except it.
- `docs/provisioning.md` — the hosted checklist (Supabase, then Vercel) and the verification table.

**Verified against the real local stack** (Supabase CLI 2.117, storage-api as shipped):

| Question | Result |
| --- | --- |
| `allowed_mime_types` on a `PUT` to a signed upload URL | Fires: `415 mime type text/plain is not supported`. Header-based only — a text body labelled `application/pdf` is accepted, so **ticket 15's extraction-at-upload is what catches a mislabelled file** and ticket 19's "type contradicts extension" case is an extraction failure, not a storage rejection. |
| `file_size_limit` on that path | Fires: `413` for a 6 MB PDF. |
| Signed-upload-URL TTL | **7200 s**, not 60 s. `createSignedUploadUrl` has no expiry argument, so the app cannot shorten it. Consequence for ticket 15: the pending-row-first rule plus a sweep of abandoned pending rows bound an unused token; the ≤ 300 s discipline applies to *download* URLs, where the expiry is a parameter. Whether Supabase Cloud overrides this is unconfirmed until a hosted project exists — the checklist asks the operator to re-run the probe. |
| `trailhead_app` genuinely `NOBYPASSRLS` | Yes, from `pg_roles`; `tests/integration/connectivity.test.ts` asserts it on every run. |
| Object owner on signed upload | The minting user (`owner_id` set from the token). Minting under another user's prefix → RLS refusal at mint time. |
| Cross-user list / sign / remove | All blocked (empty list, "Object not found", empty remove result). |
| Overwrite of an existing key | Refused by RLS — no UPDATE policy, as intended. |
| Pooler with custom roles | Works with the tenant-suffixed username (`trailhead_app.pooler-dev` locally, `trailhead_app.<ref>` hosted). |

**Needs the user (dashboard login):** creating the hosted Supabase project, linking and pushing,
setting the two role passwords, copying the API values, creating the Vercel project and its
environment variables, and the Anthropic key. Each is a numbered step in `docs/provisioning.md`.

**Acceptance criteria status:** all met locally. The two hosted-only items (Vercel project;
hosted Supabase project) are handed to the user as the checklist — the code side of each is done.

**Status:** ready-for-review (hosted steps pending on the user)
