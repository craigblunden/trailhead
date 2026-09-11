-- Ticket 17: a Job holds a resume and a cover letter separately (ticket 13's verdict).
--
-- `documentId` was one reference, so attaching an uploaded cover letter detached the resume and
-- left generation nothing to write from. It is RENAMED to `resumeId` in this migration — the
-- column now means exactly one thing, and only the data layer reads it — and `coverLetterId` joins
-- it. Both are `ON DELETE SET NULL`: deleting a Document leaves the Job intact.

ALTER TABLE "Job" RENAME COLUMN "documentId" TO "resumeId";
ALTER TABLE "Job" RENAME CONSTRAINT "Job_documentId_fkey" TO "Job_resumeId_fkey";
ALTER INDEX "Job_documentId_idx" RENAME TO "Job_resumeId_idx";

ALTER TABLE "Job" ADD COLUMN "coverLetterId" TEXT;
CREATE INDEX "Job_coverLetterId_idx" ON "Job"("coverLetterId");
ALTER TABLE "Job" ADD CONSTRAINT "Job_coverLetterId_fkey" FOREIGN KEY ("coverLetterId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The tenant policy's write check, extended (ticket 04's rule): a referenced Document must be
-- visible under the same tenant — foreign-key checks bypass RLS, so this is what refuses another
-- user's document id — and, new here, must be live and of the right kind. A cover letter can never
-- be a Job's resume, nor a resume its cover letter, whatever the application code does.
DROP POLICY "tenant_isolation" ON "Job";
CREATE POLICY "tenant_isolation" ON "Job"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK (
    "userId" = public.tenant_id()
    AND (
      "resumeId" IS NULL
      OR EXISTS (
        SELECT 1 FROM "Document" d
         WHERE d.id = "resumeId" AND d.kind = 'resume' AND d."deletedAt" IS NULL
      )
    )
    AND (
      "coverLetterId" IS NULL
      OR EXISTS (
        SELECT 1 FROM "Document" d
         WHERE d.id = "coverLetterId" AND d.kind = 'cover_letter' AND d."deletedAt" IS NULL
      )
    )
  );
