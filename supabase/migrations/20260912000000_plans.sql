-- Plans (ADR-0001). Runs as `postgres` through the Supabase CLI, like the provisioning migration.
--
-- `npm run db:plan <email> pro` puts a Tenant on a Plan by writing "UserPlan" as trailhead_migrator
-- (the application role has no grant to). The script is given an email and the table stores the
-- Supabase user id, so the migrator needs to go from one to the other — and back, to list who is
-- on a Plan. The `auth` schema is not the operator's to open (`postgres` cannot grant usage on
-- it), so two definer functions owned by `postgres` do exactly those two lookups and nothing more.
-- Only the migrator may call them.

create or replace function public.auth_user_id_by_email(lookup text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from auth.users where lower(email) = lower(lookup) limit 1;
$$;

create or replace function public.auth_email_of(user_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select email::text from auth.users where id = user_id;
$$;

revoke all on function public.auth_user_id_by_email(text) from public;
revoke all on function public.auth_email_of(uuid) from public;
grant execute on function public.auth_user_id_by_email(text) to trailhead_migrator;
grant execute on function public.auth_email_of(uuid) to trailhead_migrator;
