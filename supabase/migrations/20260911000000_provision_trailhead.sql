-- Provisioning for Trailhead (ticket 01). Runs as `postgres` through the Supabase CLI:
--   locally  → `supabase start` / `supabase db reset`
--   hosted   → `supabase db push` against the linked project
--
-- Everything platform- or cluster-level lives here, once. Application tables and their RLS
-- policies are Prisma's (`prisma/migrations/`), applied as `trailhead_migrator`.
--
-- Two application roles, both NOBYPASSRLS. Supabase's own Prisma quickstart creates the app role
-- `with … bypassrls`, which leaves every tenant policy inert while appearing to work. Ticket 04's
-- cross-user test is the only thing that would catch that, so the flag is asserted here as well.
--
-- Passwords are NOT set here: this file is pushed to the hosted project, and a password in git is
-- a leaked password. `supabase/seed.sql` sets development passwords locally; on the hosted project
-- the operator sets them once in the SQL editor (see `docs/provisioning.md`).

-- ---------------------------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- ---------------------------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'trailhead_migrator') then
    create role trailhead_migrator login nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'trailhead_app') then
    create role trailhead_app login nobypassrls;
  end if;
end
$$;

-- Belt and braces: a pre-existing role keeps whatever flags it had, so assert the one that matters.
alter role trailhead_migrator nobypassrls;
alter role trailhead_app nobypassrls;

-- `prisma migrate dev` replays the migration history into a throwaway shadow database it creates
-- itself, so the migrator needs CREATEDB. Development-time only in practice; harmless otherwise.
alter role trailhead_migrator createdb;

-- The migrator owns the schema's objects; the app role only uses them. Per-table grants to
-- `trailhead_app` (and to `postgres`, for the janitor) live in the Prisma migration that creates
-- each table, so the grant sits next to the table it is for.
grant usage, create on schema public to trailhead_migrator;
grant usage on schema public to trailhead_app;

-- ---------------------------------------------------------------------------------------------
-- Storage: the `documents` bucket and its policies
-- ---------------------------------------------------------------------------------------------

-- Private. `file_size_limit` (5 MB) and `allowed_mime_types` (PDF, DOCX) are the ONLY thing
-- enforcing size and type, because uploads go browser-direct through a signed upload URL and no
-- application code ever sees the bytes (ticket 15). Locally `supabase/config.toml` also declares
-- this bucket; the upsert keeps the two in agreement whichever runs first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The grants on storage.objects, stated once (tickets 04 and 15 both rely on them). Supabase
-- grants these to `authenticated` by default; restating them makes the assumption explicit and
-- survives a project where the defaults were tightened.
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- Storage tenancy is real enforcement, not convention: objects are rows in an RLS table, and
-- signing a download URL is itself an RLS-gated read. These policies key on BOTH the user's prefix
-- and the object's owner. They use `auth.uid()` — unlike the application tables' policies, which
-- use a transaction-local setting because Prisma bypasses PostgREST (ticket 04). `owner_id` is
-- text while `auth.uid()` is a uuid, so the cast is mandatory.
--
-- There is deliberately NO update policy: a Document is never versioned in place (CONTEXT.md),
-- and this makes that a fact at the storage layer rather than an application convention.

drop policy if exists "documents_select_own" on storage.objects;
create policy "documents_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------------------------
-- The janitor (ticket 16)
-- ---------------------------------------------------------------------------------------------

-- pg_cron runs the document sweep and nothing else. It is a janitor, not a queue. The function it
-- calls is defined by a Prisma migration (it needs the Document table), so the job tolerates the
-- function not existing yet and does nothing until it does. It runs as `postgres`, which is why
-- no application role needs — or has — a way around row-level security.
select cron.schedule(
  'trailhead-sweep-documents',
  '*/15 * * * *',
  $job$
    do $$
    begin
      if to_regproc('public.sweep_documents') is not null then
        perform public.sweep_documents();
      end if;
    end
    $$;
  $job$
);
