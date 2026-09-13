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
npm run db:seed            # optional: the seeded accounts (README → Seeded accounts)
npm run dev
```

Verification and password-reset mail lands in Mailpit at http://127.0.0.1:54324. Supabase Studio
is at http://127.0.0.1:54323.

`npm run supabase:reset` rebuilds the database from `supabase/migrations/` and re-runs
`supabase/seed.sql` (which only sets the two roles' development passwords). Run `npm run
db:deploy` again afterwards, then `npm run db:seed` if you use the seeded accounts.

`npm run db:seed` holds no key that bypasses anything:
- It makes each account through Auth's public API and follows the verification mail out of Mailpit.
- It writes rows as `trailhead_app` under that account's tenant id.
- It uploads files with that account's own session.

It refuses to run unless `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are loopback URLs. It checks
`TEST_MAIL_API_URL` too when it is set; unset, the mail reader uses the local Mailpit. Never point it at
the hosted project.

### Social sign-in, locally

The Google and GitHub buttons render only when both of a provider's variables are set
(`SUPABASE_AUTH_EXTERNAL_<PROVIDER>_CLIENT_ID` and `_SECRET`). A clean clone has neither, so
it shows no buttons and loses nothing else. To try a real provider locally, create its OAuth app
with the callback `http://127.0.0.1:54321/auth/v1/callback`, export the two variables in the shell
that runs `npm run supabase:start` **and** put them in `.env.local`, and set that provider's
`enabled = true` in `supabase/config.toml` without committing it.

`supabase/config.toml` also enables a **test-only** provider in the `gitlab` slot, pointed at a fake
identity provider the test suites start on `127.0.0.1:54399`
(`tests/fakes/oauth-provider.ts`; Auth reaches it as `host.docker.internal`). No button offers
it. It lets the integration and e2e suites run a real OAuth round trip through the local Auth
server. Never enable it on the hosted project, and never `supabase config push` this file.

## What lives where

| Concern | Owner | File |
| --- | --- | --- |
| Extensions, the two roles, schema grants, the `documents` bucket, storage policies, the janitor's cron schedule | Supabase CLI migration, run as `postgres` | `supabase/migrations/20260911000000_provision_trailhead.sql` |
| The migrator's read of `auth.users`, for `npm run db:plan` to find a user by email | Supabase CLI migration, run as `postgres` | `supabase/migrations/20260912000000_plans.sql` |
| Local bucket declaration, auth settings (confirmations on, 8-character minimum), redirect allow-list, social providers | Supabase CLI config | `supabase/config.toml` |
| Application tables, enums, indexes, RLS policies, the sweep function | Prisma migrations, run as `trailhead_migrator` | `prisma/migrations/` |
| Development passwords for the two roles (never pushed) | Local seed | `supabase/seed.sql` |
| Seeded accounts for looking at each flow (local only) | `npm run db:seed`, through Auth and `trailhead_app` | `scripts/seed/` |

An applied migration is never edited. A change is a new migration.

## Two roles, both `NOBYPASSRLS`

| Role | Connects | Used by |
| --- | --- | --- |
| `trailhead_migrator` | direct, session mode (5432 hosted, 54322 local) — `DIRECT_URL` | `prisma migrate`, and `npm run db:plan` |
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
   the provider page shows (`https://<ref>.supabase.co/auth/v1/callback`), enter the credentials
   there, and set the four `SUPABASE_AUTH_EXTERNAL_*` variables in Vercel so the buttons render.
   Leave them unset and the buttons do not render. The app's own landing,
   `<app URL>/auth/callback`, must be covered by the redirect allow-list from step 6. Then sign in
   once with each provider on the deployment: this is the one part of ticket 07 no local test can
   reach.
9. **Confirm the bucket** under _Storage_: `documents`, private, 5 MB limit, MIME types
   `application/pdf` and the DOCX type. The migration creates it; this is a check.

## Putting an account on a Plan

A Tenant's Plan is a row in `"UserPlan"` that only the migrator may write (ADR-0001); the
application role reads it and nothing more. With `DIRECT_URL` set for the project in question:

```sh
npm run db:plan                            # who is on basic or pro
npm run db:plan -- you@example.com basic   # put an account on basic
npm run db:plan -- you@example.com pro     # put an account on pro
npm run db:plan -- you@example.com free    # back to free (the row is removed)
```

The same thing in SQL, should the script not be to hand. Run it connected as `trailhead_migrator`
over `DIRECT_URL` (with `psql`, say), not from the dashboard's SQL editor: that runs as `postgres`,
which has no grant on `"UserPlan"`. An email nobody signed up with fails on the empty `"userId"`
rather than writing nothing.

```sql
-- 'basic' or 'pro'
insert into "UserPlan" ("userId", "plan", "updatedAt")
values (public.auth_user_id_by_email('you@example.com'), 'pro', now())
on conflict ("userId") do update set "plan" = excluded."plan", "updatedAt" = now();

-- back to free
delete from "UserPlan" where "userId" = public.auth_user_id_by_email('you@example.com');
```

What each Plan allows is code, not rows: `src/lib/plans.ts`.

## Lifting a Hold early

A Tenant whose Feedback carried directions to the writer twice in one quota week is on Hold until
the week rolls over on Monday (`CONTEXT.md`: Flag, Hold). The Hold is derived from `flagged` on
the week's `"GenerationQuota"` row, so there is nothing to delete: to lift one early, as the
migrator, zero this week's count for that user. No script exists for this yet, by choice.

```sql
update "GenerationQuota"
   set "flagged" = 0, "updatedAt" = now()
 where "userId" = (select id from auth.users where lower(email) = lower('you@example.com'))
   and "weekStart" = date_trunc('week', now() at time zone 'utc')::date;
```

Who is being flagged is in the logs: one JSON line per Flag, operation `generation.flag`, with the
tenant and the source (`feedback` or `hidden`) and never the text.

## Hosted: Vercel

1. Create the project from this repository. Framework preset: Next.js. Build command is the
   default (`npm run build`, which runs `prisma generate` first).
2. Add every variable from `.env.example` except the test-only `TEST_*` variables (`TEST_MAIL_API_URL`, and `TEST_POSTGRES_URL` — the local `postgres` superuser, which must never reach a hosted project) to _Production_ and
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

## What ticket 07 verified against a real stack

Account linking, asserted by `tests/integration/social-linking.test.ts` against the local Auth
server (`gotrue` v2.196.0) with a real OAuth round trip and a fake identity provider. Auth's
linking decision does not depend on which provider the identity came from.

| Situation | What Auth does |
| --- | --- |
| Verified password account, then a social identity whose provider verified the same address | **Links**: the same user id — so the same jobs — with both identities. The password keeps working. The provider's name replaces the display name from sign-up. |
| Verified password account, then a social identity whose provider did **not** verify the address | **Refuses** with `provider_email_needs_verification`; the app lands on `/login?error=oauth`. No second account. |
| Unverified password sign-up (someone squatting the address), then the owner's verified social identity | The owner gets the account; Auth **strips the unverified password identity**, so the squatter's password stops working. |
| Social account first, then a password sign-up for the same address | Auth reports it already registered; no second account. The form shows the usual "check your email". |
| Auth finds an existing identity by (provider, provider user id) **before** email | A provider account whose address changed still reaches the user it first created. |
