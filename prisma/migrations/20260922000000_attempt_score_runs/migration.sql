-- Scoring an Attempt spends no quota, and re-scoring one is deliberate: a scoring failure must
-- always be safe to retry, because the Tenant already paid for the Attempt when they started it.
-- That left `POST /api/attempts/:id/score` as the one model call in this application with nothing
-- bounding how often it may be made.
--
-- `scoreRuns` is that bound, and it counts SUCCESSFUL scorings only: it is incremented atomically
-- before the scoring call and given back when the call fails, exactly as an Attempt is reserved
-- from `InterviewQuota` and refunded (see src/server/data/interview.ts). So retrying a failure is
-- still free, and a Tenant still cannot hold a scored Attempt open and re-score it without end.
--
-- Existing rows start at 0 rather than at 1 for an already-scored Attempt: the cap is generous, the
-- backfill would be a guess, and an Attempt scored before this migration has already been paid for.
-- The table's tenant policy and grants already cover a new column.

ALTER TABLE "Attempt"
  ADD COLUMN "scoreRuns" INTEGER NOT NULL DEFAULT 0;
