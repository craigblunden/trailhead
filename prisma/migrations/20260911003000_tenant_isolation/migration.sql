-- Tenant isolation (ticket 04). After this migration the database itself refuses to hand one
-- user's rows to another: isolation is a property of Postgres, not a promise made by application
-- code.
--
-- The tenant is a TRANSACTION-LOCAL setting, `app.tenant_id`, set by `withTenant()` as the first
-- statement of a transaction. Postgres reverts it at COMMIT/ROLLBACK, before Supavisor can hand
-- the connection to anyone else, so the guarantee is server-side rather than pooler-side. A
-- session-level SET is the unsafe thing and never appears.
--
-- Policies use this setting, NOT auth.uid(): Prisma talks to Postgres directly and bypasses
-- PostgREST, so auth.uid() is null on this path. (Storage policies do use auth.uid() — a
-- different predicate at a different layer; see the Supabase provisioning migration.)
--
-- The two-argument current_setting() returns NULL when the setting was never set, and Postgres
-- leaves '' behind once a transaction-local value has been reverted; nullif() folds both to NULL,
-- so a query issued outside withTenant() matches nothing. It fails CLOSED.

create or replace function public.tenant_id() returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('app.tenant_id', true), '')::uuid
  $$;

-- FORCE is required: a table's owner (trailhead_migrator) bypasses RLS by default.
alter table "Job"           enable row level security;
alter table "Job"           force row level security;
alter table "ActivityEntry" enable row level security;
alter table "ActivityEntry" force row level security;
alter table "Contact"       enable row level security;
alter table "Contact"       force row level security;
alter table "JobContact"    enable row level security;
alter table "JobContact"    force row level security;
alter table "Document"      enable row level security;
alter table "Document"      force row level security;

-- One policy per table covers the read predicate (USING) and the write check (WITH CHECK), so a
-- row can be neither read nor written under any other tenant. Scoped to the application role;
-- `postgres` (the janitor) keeps its BYPASSRLS, and the migrator has no policy at all.
--
-- Where a row references another table, the write check also requires the referenced row to be
-- visible under the same tenant. Foreign-key checks bypass RLS, so without this a user could link
-- their own job to someone else's contact id. The subqueries run under these same policies, so
-- "visible" means "belongs to this tenant".

create policy "tenant_isolation" on "Job"
  for all to trailhead_app
  using ("userId" = public.tenant_id())
  with check (
    "userId" = public.tenant_id()
    and ("documentId" is null or exists (select 1 from "Document" d where d.id = "documentId"))
  );

create policy "tenant_isolation" on "ActivityEntry"
  for all to trailhead_app
  using ("userId" = public.tenant_id())
  with check (
    "userId" = public.tenant_id()
    and exists (select 1 from "Job" j where j.id = "jobId")
  );

create policy "tenant_isolation" on "Contact"
  for all to trailhead_app
  using ("userId" = public.tenant_id())
  with check ("userId" = public.tenant_id());

create policy "tenant_isolation" on "JobContact"
  for all to trailhead_app
  using ("userId" = public.tenant_id())
  with check (
    "userId" = public.tenant_id()
    and exists (select 1 from "Job" j where j.id = "jobId")
    and exists (select 1 from "Contact" c where c.id = "contactId")
  );

create policy "tenant_isolation" on "Document"
  for all to trailhead_app
  using ("userId" = public.tenant_id())
  with check ("userId" = public.tenant_id());
