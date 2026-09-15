-- Account deletion (ADR-0004). Runs as `postgres` through the Supabase CLI, like the provisioning
-- migration: the function must be owned by `postgres` to reach `auth.users`, which the Prisma
-- migrator cannot own or be granted.
--
-- `erase_my_account()` erases the Tenant in scope — the transaction-local `app.tenant_id` that
-- `withTenant()` sets and every tenant policy trusts — and nothing else. It takes no argument, so
-- the application role cannot name anyone but itself. In one call, and so in the caller's one
-- transaction: every tenant row, then the `auth.users` row, whose identities, sessions, factors,
-- and tokens cascade (Auth's own foreign keys).
--
-- It never touches `storage.objects`: Storage rows are removed through the Storage API, as the
-- user, before this runs (`src/server/data/account.ts`).
--
-- It returns how many Auth users it deleted: 1, or 0 when a retry finds the Account already gone.
-- plpgsql resolves the tables when it is called, so creating it before Prisma's migrations make
-- them is fine; the `postgres` grants it needs sit beside the tables, in
-- prisma/migrations/20260915000000_account_deletion_grants.

create or replace function public.erase_my_account()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid := public.tenant_id();
  erased integer;
begin
  -- Never "everyone whose id is null": outside withTenant() there is no one to erase.
  if tenant is null then
    raise exception 'erase_my_account: no tenant in scope';
  end if;

  -- Links and history before Jobs, Jobs before the Documents they attach.
  delete from public."JobContact" where "userId" = tenant;
  delete from public."ActivityEntry" where "userId" = tenant;
  delete from public."Job" where "userId" = tenant;
  delete from public."Contact" where "userId" = tenant;
  delete from public."Document" where "userId" = tenant;
  delete from public."GenerationQuota" where "userId" = tenant;
  delete from public."UserPlan" where "userId" = tenant;

  delete from auth.users where id = tenant;
  get diagnostics erased = row_count;
  return erased;
end;
$$;

-- Supabase's default privileges grant EXECUTE to the Data API roles as well as `public`.
revoke all on function public.erase_my_account() from public, anon, authenticated, service_role;
grant execute on function public.erase_my_account() to trailhead_app;
