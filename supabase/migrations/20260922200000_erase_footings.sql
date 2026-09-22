-- Account deletion (ADR-0004), extended to Footings (footing ticket 02, ADR-0007): a Footing and its
-- dimensions. Same function, same rules — it erases only the Tenant in scope, in the caller's one
-- transaction.
--
-- Dimensions before Footings, as an Attempt's questions go before it, and both before Jobs.
--
-- The `postgres` grants these need sit beside the tables, in prisma/migrations/20260922200000_footing.

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

  -- Links, history, rehearsals and scorings before Jobs, Jobs before the Documents they attach.
  delete from public."JobContact" where "userId" = tenant;
  delete from public."ActivityEntry" where "userId" = tenant;
  delete from public."AttemptQuestion" where "userId" = tenant;
  delete from public."Attempt" where "userId" = tenant;
  delete from public."PracticeQuestion" where "userId" = tenant;
  delete from public."PracticeRound" where "userId" = tenant;
  delete from public."FootingDimension" where "userId" = tenant;
  delete from public."Footing" where "userId" = tenant;
  delete from public."Job" where "userId" = tenant;
  delete from public."Contact" where "userId" = tenant;
  delete from public."Document" where "userId" = tenant;
  delete from public."GenerationQuota" where "userId" = tenant;
  delete from public."InterviewQuota" where "userId" = tenant;
  delete from public."TermsAcceptance" where "userId" = tenant;
  delete from public."UserPlan" where "userId" = tenant;

  delete from auth.users where id = tenant;
  get diagnostics erased = row_count;
  return erased;
end;
$$;

revoke all on function public.erase_my_account() from public, anon, authenticated, service_role;
grant execute on function public.erase_my_account() to trailhead_app;
