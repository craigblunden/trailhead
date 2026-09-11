-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('interested', 'applied', 'interviewing', 'offer', 'rejected');

-- CreateEnum
CREATE TYPE "Accent" AS ENUM ('moss', 'forest', 'teal', 'wheat', 'olive', 'slate');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('recruiter', 'hiring_manager', 'referrer', 'other');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('resume', 'cover_letter');

-- CreateEnum
CREATE TYPE "IngestionState" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "stage" "Stage" NOT NULL DEFAULT 'interested',
    "postingUrl" TEXT NOT NULL DEFAULT '',
    "addedOn" DATE NOT NULL,
    "appliedOn" DATE,
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "accent" "Accent" NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEntry" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContactKind" NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "agency" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "lastSpokenOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContact" (
    "jobId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobContact_pkey" PRIMARY KEY ("jobId","contactId")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL DEFAULT '',
    "ingestion" "IngestionState" NOT NULL DEFAULT 'pending',
    "ingestionError" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_userId_createdAt_idx" ON "Job"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_documentId_idx" ON "Job"("documentId");

-- CreateIndex
CREATE INDEX "ActivityEntry_jobId_date_createdAt_idx" ON "ActivityEntry"("jobId", "date" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEntry_userId_idx" ON "ActivityEntry"("userId");

-- CreateIndex
CREATE INDEX "Contact_userId_name_idx" ON "Contact"("userId", "name");

-- CreateIndex
CREATE INDEX "JobContact_contactId_idx" ON "JobContact"("contactId");

-- CreateIndex
CREATE INDEX "JobContact_userId_idx" ON "JobContact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContact" ADD CONSTRAINT "JobContact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContact" ADD CONSTRAINT "JobContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants. The roles come from the Supabase provisioning migration; the grants sit here, next to
-- the tables they are for. `trailhead_app` runs the application. `postgres` runs the document
-- sweep through pg_cron (ticket 16) and needs nothing else.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Job", "ActivityEntry", "Contact", "JobContact", "Document" TO trailhead_app;
GRANT SELECT, DELETE ON "Document" TO postgres;
