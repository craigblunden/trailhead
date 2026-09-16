-- Interview simulator ticket 01: an Attempt, its generated questions and their Answers, and the
-- weekly counter Attempts are taken from. Tenant data like everything else (ticket 04): forced RLS,
-- one policy over the transaction-local tenant for both the read predicate and the write check.

CREATE TYPE "Category" AS ENUM ('personal', 'behavioural', 'stakeholder', 'technical', 'design');

-- One timed run against one Job. `activeSeconds` is active-time accounting, not a wall-clock
-- deadline: it grows only while questions are being answered, so a closed tab drains nothing.
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "overallScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- The question set, persisted at generation time and never regenerated, with the Answer recorded
-- against each question on the same row.
CREATE TABLE "AttemptQuestion" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "attemptId" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),
    "score" INTEGER,
    "rationale" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- Its own counter, not a column on "GenerationQuota": that table's Flag and Hold semantics are
-- specific to cover-letter Feedback abuse and mean nothing for an Attempt.
CREATE TABLE "InterviewQuota" (
    "userId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuota_pkey" PRIMARY KEY ("userId","weekStart")
);

CREATE INDEX "Attempt_userId_jobId_startedAt_idx" ON "Attempt"("userId", "jobId", "startedAt" DESC);
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_order_key" ON "AttemptQuestion"("attemptId", "order");
CREATE INDEX "AttemptQuestion_userId_idx" ON "AttemptQuestion"("userId");

ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Attempt" TO trailhead_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AttemptQuestion" TO trailhead_app;
GRANT SELECT, INSERT, UPDATE ON "InterviewQuota" TO trailhead_app;

ALTER TABLE "Attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Attempt"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

ALTER TABLE "AttemptQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttemptQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AttemptQuestion"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- The reservation is an upsert, which needs SELECT, INSERT, and UPDATE to pass the same policy.
ALTER TABLE "InterviewQuota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterviewQuota" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "InterviewQuota"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- Account deletion (ADR-0004): `public.erase_my_account()` deletes as `postgres`, so it needs the
-- same SELECT and DELETE on these tables as on every other tenant table. The grants sit beside the
-- tables, as the others do; the function itself is updated in
-- supabase/migrations/20260916000000_erase_attempts.sql.
GRANT SELECT, DELETE ON "Attempt", "AttemptQuestion", "InterviewQuota" TO postgres;
