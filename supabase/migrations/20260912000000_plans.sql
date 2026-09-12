-- Plans (ADR-0001). Runs as `postgres` through the Supabase CLI, like the provisioning migration.
--
-- `npm run db:plan <email> pro` puts a Tenant on a Plan by writing "UserPlan" as trailhead_migrator
-- (the application role has no grant to). The script is given an email and the table stores the
-- Supabase user id, so the migrator needs to read `auth.users` to go from one to the other.
-- `postgres` holds SELECT on it with grant option; nothing else in the auth schema is opened.
grant select on auth.users to trailhead_migrator;
