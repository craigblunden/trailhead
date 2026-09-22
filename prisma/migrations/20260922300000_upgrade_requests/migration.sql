-- Upgrade requests (upgrade-requests ticket 01, ADR-0009): a Tenant asking to be moved up a Plan.
--
-- Insert-only on purpose. `trailhead_app` gets SELECT and INSERT and NOT UPDATE or DELETE, because
-- whether a request is still pending is derived from the Tenant's Plan and `requestedAt` rather than
-- stored — there is no status to flip, and nothing here is ever edited or withdrawn. Asking again
-- after a request lapses is a new row, and the rows that remain are the history of who has been asking.
--
-- This does NOT weaken ADR-0001. `UserPlan` keeps exactly the grants it had: the application role can
-- read a Plan and can never write one. A row that ASKS for a Plan is ordinary tenant data, and nothing
-- reads one when deciding a Limit.

CREATE TABLE "UpgradeRequest" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id")
);

-- Pending reads the newest row for one Tenant, so the index is the order it reads in.
CREATE INDEX "UpgradeRequest_userId_requestedAt_idx" ON "UpgradeRequest"("userId", "requestedAt");

GRANT SELECT, INSERT ON "UpgradeRequest" TO trailhead_app;

ALTER TABLE "UpgradeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UpgradeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "UpgradeRequest"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- Forced RLS binds the owner too, so the migrator — the operator's hands, the same role `npm run
-- db:plan` runs as — is named in a policy of its own, exactly as it is on "UserPlan". It is how the
-- operator reads who has been asking, and the write side a future `--clear-requests` would use. The
-- application role's grants are unchanged by it: no UPDATE, no DELETE, whatever this policy allows.
CREATE POLICY "migrator_manages_requests" ON "UpgradeRequest"
  FOR ALL TO trailhead_migrator
  USING (true)
  WITH CHECK (true);

-- Account deletion (ADR-0004): `public.erase_my_account()` deletes as `postgres`, so it needs the
-- same SELECT and DELETE here as on every other tenant table. The function itself is updated in
-- supabase/migrations/20260922300000_erase_upgrade_requests.sql.
GRANT SELECT, DELETE ON "UpgradeRequest" TO postgres;
