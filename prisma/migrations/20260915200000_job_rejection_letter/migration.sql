-- A Job keeps the Rejection letter the user pastes onto it, for reference. Plain text beside the
-- description and notes: the existing grants and tenant policy already cover the new column.
ALTER TABLE "Job" ADD COLUMN "rejectionLetter" TEXT NOT NULL DEFAULT '';
