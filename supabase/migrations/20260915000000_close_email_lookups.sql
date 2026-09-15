-- The two email lookups from the Plans migration (20260912000000_plans.sql) are for the migrator
-- alone, and that migration revoked EXECUTE from `public` only. Supabase's default privileges on the
-- `public` schema also grant EXECUTE on every function `postgres` creates to `anon`,
-- `authenticated`, and `service_role`, and `public` is exposed through the Data API, so anyone
-- holding the publishable key could turn an email into a user id and back through `/rpc`. Revoked
-- by name here. Every definer function after this revokes all four roles when it is created, and
-- tests/integration/account-deletion.test.ts fails if one does not.

revoke all on function public.auth_user_id_by_email(text) from anon, authenticated, service_role;
revoke all on function public.auth_email_of(uuid) from anon, authenticated, service_role;
