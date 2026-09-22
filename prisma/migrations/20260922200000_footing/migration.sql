-- A Footing and its dimensions (footing ticket 02, ADR-0007): the kept result of scoring one Job's
-- posting against its Application kit, and one row per dimension scored.
--
-- Append-only. Scoring inserts; nothing in the application updates or deletes a Footing, and the
-- newest row for a Job is "the Footing". The volume is bounded by how often a human clicks.
--
-- The overall band is deliberately NOT a column: it is computed from the four weighted dimensions at
-- read time, so tuning the weights re-reads history correctly instead of leaving a stored number that
-- no formula explains.
--
-- "resumeId" and "coverLetterId" carry no foreign key on purpose. A Footing whose resume Document was
-- later deleted must be KEPT and read permanently stale — the hashes outlive the Document — so a
-- cascade or a SET NULL here would either take the Footing away or erase the evidence of what it saw.
-- The Job is different: a Footing is about a Job, so it goes when the Job does.
--
-- Tenant data like everything else: forced RLS, one policy over the transaction-local tenant for both
-- the read predicate and the write check.

CREATE TYPE "Dimension" AS ENUM ('skills', 'experience', 'domain', 'proof_of_work', 'letter');

CREATE TABLE "Footing" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeId" TEXT,
    "coverLetterId" TEXT,
    "resumeHash" TEXT NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "coverLetterHash" TEXT NOT NULL,

    CONSTRAINT "Footing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FootingDimension" (
    "footingId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "dimension" "Dimension" NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FootingDimension_pkey" PRIMARY KEY ("footingId", "dimension")
);

CREATE INDEX "Footing_userId_jobId_scoredAt_idx" ON "Footing"("userId", "jobId", "scoredAt" DESC);
CREATE INDEX "FootingDimension_userId_idx" ON "FootingDimension"("userId");

ALTER TABLE "Footing" ADD CONSTRAINT "Footing_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FootingDimension" ADD CONSTRAINT "FootingDimension_footingId_fkey"
  FOREIGN KEY ("footingId") REFERENCES "Footing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Footing" TO trailhead_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FootingDimension" TO trailhead_app;

ALTER TABLE "Footing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Footing" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Footing"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

ALTER TABLE "FootingDimension" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FootingDimension" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "FootingDimension"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- Account deletion (ADR-0004): `public.erase_my_account()` deletes as `postgres`, so it needs the
-- same SELECT and DELETE on these tables as on every other tenant table. The function itself is
-- updated in supabase/migrations/20260922200000_erase_footings.sql.
GRANT SELECT, DELETE ON "Footing", "FootingDimension" TO postgres;
