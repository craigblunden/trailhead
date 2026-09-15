-- The document sweep (`public.sweep_documents()`, every 15 minutes) looks across every user's
-- Documents twice, both times by age: uploads never finished, to tombstone, and tombstones old enough
-- to finish. No index served the first, so each run read the whole table; the second used an index on
-- `deletedAt` that mostly held the nulls of live rows.
--
-- Both are partial indexes on `createdAt` now, holding only the rows each step can match — few or none
-- at any moment, however many Documents there are. Their predicates are the sweep's own, word for word,
-- which is what lets the planner use them. The schema declares them (the `partialIndexes` preview
-- feature), so Migrate keeps them.

-- DropIndex
DROP INDEX "Document_deletedAt_idx";

-- CreateIndex
CREATE INDEX "Document_unfinished_createdAt_idx" ON "Document"("createdAt") WHERE ("deletedAt" IS NULL AND ingestion <> 'ready');

-- CreateIndex
CREATE INDEX "Document_tombstoned_createdAt_idx" ON "Document"("createdAt") WHERE ("deletedAt" IS NOT NULL);
