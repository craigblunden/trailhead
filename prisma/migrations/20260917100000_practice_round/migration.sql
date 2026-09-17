-- Practice round ticket 03: a short, general, unscored run of the Interview Simulator and its
-- questions with their Answers. Stored apart from "Attempt" (ADR-0006) — no Job, no length, no quota,
-- no scores — but tenant data like everything else: forced RLS, one policy over the
-- transaction-local tenant for both the read predicate and the write check.

CREATE TABLE "PracticeRound" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "roundId" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticeRound_userId_startedAt_idx" ON "PracticeRound"("userId", "startedAt" DESC);
CREATE UNIQUE INDEX "PracticeQuestion_roundId_order_key" ON "PracticeQuestion"("roundId", "order");
CREATE INDEX "PracticeQuestion_userId_idx" ON "PracticeQuestion"("userId");

ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "PracticeRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PracticeRound" TO trailhead_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PracticeQuestion" TO trailhead_app;

ALTER TABLE "PracticeRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeRound" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "PracticeRound"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

ALTER TABLE "PracticeQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "PracticeQuestion"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- Account deletion (ADR-0004): `public.erase_my_account()` deletes as `postgres`, so it needs the
-- same SELECT and DELETE on these tables as on every other tenant table. The function itself is
-- updated in supabase/migrations/20260917100000_erase_practice_rounds.sql.
GRANT SELECT, DELETE ON "PracticeRound", "PracticeQuestion" TO postgres;
