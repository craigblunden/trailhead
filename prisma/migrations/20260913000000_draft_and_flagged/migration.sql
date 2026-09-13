-- Feedback issue 01 (ADR-0002): a Job keeps its last Draft, and the quota week counts its Flags.
--
-- The Draft is two columns on Job, not a table: a Job has at most one, each write replaces it, and
-- it goes with the Job. `flagged` on GenerationQuota is this week's Flags; the Hold is derived
-- (`flagged >= 2`), never stored, so it lapses on Monday with the letter count. Both tables already
-- carry the tenant policy, and a policy covers every column, so nothing changes in RLS.
ALTER TABLE "Job"
  ADD COLUMN "draft" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "draftWrittenAt" TIMESTAMP(3);

ALTER TABLE "GenerationQuota"
  ADD COLUMN "flagged" INTEGER NOT NULL DEFAULT 0;
