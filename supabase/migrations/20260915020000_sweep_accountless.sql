-- The janitor's second job (account issue 03, ADR-0004). Runs as `postgres` through the Supabase
-- CLI, beside the document sweep's schedule in the provisioning migration.
--
-- `getClaims()` verifies an access token without asking Auth, so a token issued before Account
-- deletion keeps working until it expires. A second tab can write a Job, a Contact, an Activity
-- entry, or a quota week for a Tenant whose Account is gone, and nothing else would ever remove it.
-- This deletes rows in every tenant table whose `userId` has no `auth.users` row.
--
-- - A row last written within the past two hours is left for a later run: longer than an access
--   token lives (`jwt_expiry`, 3600 s), so a stale token cannot still be writing to it, and a
--   test's rows under a made-up tenant id are never swept out from under it.
-- - A Document row is kept while its object still exists. No one can remove that object now —
--   Storage rows are never deleted with SQL — and the row is the only record that it exists
--   (`docs/deferred.md`). Once the object is gone, the row goes.
--
-- Idempotent, like `sweep_documents()`. Returns how many rows it deleted. It runs as `postgres`,
-- which holds SELECT and DELETE on the tenant tables (prisma/migrations/20260915000000_account_
-- deletion_grants) and only ever reads `auth.users` and `storage.objects`.

create or replace function public.sweep_accountless()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settled constant timestamp := now() - interval '2 hours';
  swept integer := 0;
  n integer;
begin
  delete from public."JobContact" t
   where t."createdAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."ActivityEntry" t
   where t."createdAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."Job" t
   where t."updatedAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."Contact" t
   where t."updatedAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."Document" t
   where t."updatedAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId")
     and not exists (
       select 1
         from storage.objects o
        where o.bucket_id = 'documents'
          and o.name = t."storageKey"
     );
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."GenerationQuota" t
   where t."updatedAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  delete from public."UserPlan" t
   where t."updatedAt" < settled
     and not exists (select 1 from auth.users u where u.id = t."userId");
  get diagnostics n = row_count;
  swept := swept + n;

  return swept;
end;
$$;

revoke all on function public.sweep_accountless() from public, anon, authenticated, service_role;
grant execute on function public.sweep_accountless() to postgres;

-- A schedule of its own, so the cron list says what runs. Hourly is plenty: a row waits two hours
-- whatever the cadence. Like the document sweep, it tolerates the function not existing.
select cron.schedule(
  'trailhead-sweep-accountless',
  '23 * * * *',
  $job$
    do $$
    begin
      if to_regproc('public.sweep_accountless') is not null then
        perform public.sweep_accountless();
      end if;
    end
    $$;
  $job$
);
