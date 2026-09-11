# Provisioning

How a clean clone reaches a running application, and what the hosted project needs that no
script can do. The environment contract is `.env.example`; everything below explains where each
value comes from.

## Local (no dashboard, no accounts)

The whole stack runs locally through the Supabase CLI (installed as a dev dependency) on Docker.

```bash
npm install
npm run supabase:start     # Postgres, Auth, Storage, Mailpit; applies supabase/migrations + seed.sql
cp .env.example .env.local # the local values are already filled in
npm run db:deploy          # Prisma migrations, as trailhead_migrator
npm run dev
```

Verification and password-reset mail lands in Mailpit at http://127.0.0.1:54324. Supabase Studio
is at http://127.0.0.1:54323.

`npm run supabase:reset` rebuilds the database from `supabase/migrations/` and re-runs
`supabase/seed.sql` (which only sets the two roles' development passwords). Run `npm run
db:deploy` again afterwards.

## What lives where

| Concern | Owner | File |
| --- | --- | --- |
| Extensions, the two roles, schema grants, the `documents` bucket, storage policies, the janitor's cron schedule | Supabase CLI migration, run as `postgres` | `supabase/migrations/20260911000000_provision_trailhead.sql` |
| Local bucket declaration, auth settings (confirmations on, 8-character minimum), redirect allow-list, social providers | Supabase CLI config | `supabase/config.toml` |
| Application tables, enums, indexes, RLS policies, the sweep function | Prisma migrations, run as `trailhead_migrator` | `prisma/migrations/` |
| Development passwords for the two roles (never pushed) | Local seed | `supabase/seed.sql` |

An applied migration is never edited. A change is a new migration.

## Two roles, both `NOBYPASSRLS`

| Role | Connects | Used by |
| --- | --- | --- |
| `trailhead_migrator` | direct, session mode (5432 hosted, 54322 local) — `DIRECT_URL` | `prisma migrate` only |
| `trailhead_app` | Supavisor, transaction mode (6543 hosted, 54329 local) — `DATABASE_URL` | the running application |

Supabase's own Prisma quickstart creates the app role `with … bypassrls`. That leaves every tenant
policy inert while appearing to work. Both roles are asserted `NOBYPASSRLS` in the provisioning
migration and re-checked from `pg_roles` by `tests/integration/connectivity.test.ts`.

Through Supavisor the username carries the tenant: `trailhead_app.<project-ref>` on the hosted
project, `trailhead_app.pooler-dev` locally.

## Hosted: Supabase

Things only a dashboard login can do. Do them once, in this order.

1. **Create the project** (Postgres, Auth and Storage are on by default). Note the project ref.
2. **Link and push**: `npx supabase link --project-ref <ref>` then `npx supabase db push`. This
   applies the provisioning migration: extensions, roles, bucket, storage policies, cron job.
3. **Set the two role passwords** in the SQL editor — they are deliberately not in git:
   ```sql
   alter role trailhead_migrator password '<strong password>';
   alter role trailhead_app password '<strong password>';
   ```
4. **Compose the URLs** from _Project Settings → Database_:
   - `DIRECT_URL`: the direct connection string, user `trailhead_migrator`, port 5432.
   - `DATABASE_URL`: the transaction pooler string, user `trailhead_app.<ref>`, port 6543.
5. **Apply the application migrations**: with those two variables in `.env.local`, run
   `npm run db:deploy`.
6. **Auth settings** (_Authentication → Providers → Email_): confirmations **on**, minimum
   password length **8**. _URL configuration_: site URL is the Vercel production URL; add the
   preview URL pattern to the redirect allow-list.
7. **Copy the API values** from _Project Settings → API_: `NEXT_PUBLIC_SUPABASE_URL` and the
   publishable key as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do **not** copy the secret /
   `service_role` key anywhere in this project.
8. **Social sign-in (optional)**: create the Google and GitHub OAuth apps with the callback URL
   the provider page shows, enter the credentials there, and set the four
   `SUPABASE_AUTH_EXTERNAL_*` variables in Vercel so the buttons render. Leave them unset and the
   buttons do not render.
9. **Confirm the bucket** under _Storage_: `documents`, private, 5 MB limit, MIME types
   `application/pdf` and the DOCX type. The migration creates it; this is a check.

## Hosted: Vercel

1. Create the project from this repository. Framework preset: Next.js. Build command is the
   default (`npm run build`, which runs `prisma generate` first).
2. Add every variable from `.env.example` except `TEST_MAIL_API_URL` to _Production_ and
   _Preview_. `ANTHROPIC_API_KEY` is a key created for this project alone, so it can be revoked
   without touching anything else.
3. Deploy. Then add the deployment URL to the Supabase redirect allow-list (step 6 above).

## What ticket 01 verified against a real stack

Recorded here because the tickets that depend on it must not re-derive it.

| Question | Answer (local stack, `storage-api` in Supabase CLI 2.117) |
| --- | --- |
| Does `allowed_mime_types` fire on a `PUT` to a signed upload URL? | **Yes** — `415 mime type text/plain is not supported`. It checks the declared `Content-Type` header only: a text body labelled `application/pdf` is accepted. Extraction at upload (ticket 15) is what catches a mislabelled file. |
| Does `file_size_limit` fire on that path? | **Yes** — a 6 MB PDF returns `413 The object exceeded the maximum allowed size`. |
| What is the signed-upload-URL TTL? | **7200 s** in this version; `createSignedUploadUrl` takes no expiry argument, so the application cannot shorten it. The row-before-object rule and the sweep of abandoned pending rows (tickets 15, 16) are what bound an unused token. Download URLs take an explicit expiry, and the application mints those at ≤ 300 s. |
| Is `trailhead_app` genuinely `NOBYPASSRLS`? | **Yes**, from `pg_roles` — asserted by the integration suite on every run. |
| Who owns an object uploaded through a signed upload URL? | The user who minted the URL: `owner_id` is set from the token, so the owner-keyed policies hold. Minting under another user's prefix is refused by RLS at mint time. |
| Can a second user list, sign a download URL for, or remove another user's object? | **No** to all three — list returns empty, sign returns "Object not found", remove returns an empty result. |
| Can an existing key be overwritten? | **No** — with no UPDATE policy, minting an upsert URL for an existing key is refused by RLS. |
