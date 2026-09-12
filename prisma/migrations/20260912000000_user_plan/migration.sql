-- Plans issue 02 (ADR-0001): which Plan a Tenant is on. No row means the default Plan, so nothing
-- runs at sign-up. The app role may SELECT under the tenant policy and nothing else: no code path
-- in the application can move a Tenant between Plans. `npm run db:plan`, as trailhead_migrator,
-- is what does.
CREATE TYPE "Plan" AS ENUM ('free', 'pro');

CREATE TABLE "UserPlan" (
    "userId" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("userId")
);

GRANT SELECT ON "UserPlan" TO trailhead_app;

-- Tenant data for reading (ticket 04): forced RLS, one policy over the transaction-local tenant.
-- SELECT only for the app role — its write side is refused by the missing grant before any policy
-- is consulted. Forced RLS binds the owner too, so the migrator, which writes this table on the
-- operator's behalf, is named in a policy of its own.
ALTER TABLE "UserPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPlan" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read" ON "UserPlan"
  FOR SELECT TO trailhead_app
  USING ("userId" = public.tenant_id());

CREATE POLICY "migrator_sets_plans" ON "UserPlan"
  FOR ALL TO trailhead_migrator
  USING (true)
  WITH CHECK (true);
