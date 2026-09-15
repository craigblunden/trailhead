-- Account deletion (ADR-0004): `public.erase_my_account()` is a definer function owned by `postgres`
-- (supabase/migrations/20260915010000_erase_my_account.sql), so it deletes as `postgres`, which held
-- only SELECT and DELETE on "Document" for the document sweep. It needs the same on every tenant
-- table; SELECT because a DELETE's WHERE reads the column. The grants sit here, beside the tables,
-- as the janitor's did. `postgres` keeps BYPASSRLS, so no policy is added.
GRANT SELECT, DELETE ON "Job", "ActivityEntry", "Contact", "JobContact", "GenerationQuota", "UserPlan" TO postgres;
