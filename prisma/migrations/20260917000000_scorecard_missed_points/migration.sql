-- Interview second pass ticket 05: what landed and the Missed points for each Answer, and the
-- Takeaway for the Attempt. Every column defaults to empty, so an Attempt scored before this reads as
-- it did — its one rationale per Answer, and no Takeaway. The tables' tenant policies and grants
-- already cover new columns.

ALTER TABLE "AttemptQuestion"
  ADD COLUMN "whatLanded" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "missedPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Attempt"
  ADD COLUMN "takeaway" JSONB NOT NULL DEFAULT '[]';
