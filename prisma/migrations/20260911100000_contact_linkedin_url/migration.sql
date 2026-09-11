-- Ticket 14: a Contact's LinkedIn profile earns a column (ticket 13's verdict). Stored like
-- `Job.postingUrl`: blank means none, and only http(s) addresses are accepted on write
-- (`src/server/validation.ts`). The tenant policy on "Contact" covers the new column unchanged.
ALTER TABLE "Contact" ADD COLUMN "linkedinUrl" TEXT NOT NULL DEFAULT '';
