-- Ticket 18: the generation quota. The only thing cover-letter generation persists. One row per
-- user per quota week (weeks start Monday, UTC); `used` counts letters reserved and not given back.
CREATE TABLE "GenerationQuota" (
    "userId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationQuota_pkey" PRIMARY KEY ("userId","weekStart")
);

GRANT SELECT, INSERT, UPDATE ON "GenerationQuota" TO trailhead_app;

-- Tenant data like everything else (ticket 04): forced RLS, one policy over the transaction-local
-- tenant for both the read predicate and the write check. The reservation is an upsert, which
-- needs SELECT, INSERT, and UPDATE to pass the same policy.
ALTER TABLE "GenerationQuota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GenerationQuota" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "GenerationQuota"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());
