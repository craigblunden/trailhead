# 02: A Footing is kept as history, and erased with the Tenant

**What to build:** The `Footing` and `FootingDimension` tables, their mappers, and the migration that
extends `erase_my_account`.

See `spec.md` → How it is shown ("derived at read time, never stored"), When it happens. **ADR-0007**
for history rather than replacement; **ADR-0004** for why erasure is a migration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-review

- [ ] `Footing`: `id`, `userId`, `jobId`, `scoredAt`, and the staleness stamp — `resumeId`,
      `coverLetterId`, and SHA-256 hashes of the resume text, the description and the letter text.
      Hashes, not copies: `Document.text` already "doubles as the content hash for later comparison".
- [ ] `FootingDimension`: `footingId`, `userId`, `dimension`, `score` (0–100, normalised), `confidence`.
      A `FootingDimension` enum in the schema, with its members matched by `enum-assertions.ts` against
      `FOOTING_DIMENSIONS` so the two cannot drift.
- [ ] **Append-only.** Scoring inserts; nothing updates or deletes a Footing. The newest row for a Job
      is "the Footing"; the rest are its history. Index on `[userId, jobId, scoredAt(sort: Desc)]`.
- [ ] **The overall is not a column.** It is computed from the four weighted dimensions at read time.
- [ ] A Footing whose resume Document was later deleted is **kept** and reads permanently stale. The
      `resumeId` reference must not cascade the Footing away — the hashes outlive the Document.
- [ ] `supabase/migrations/…_erase_footings.sql` extends `erase_my_account` to both tables, following
      `erase_attempts` and `erase_practice_rounds` exactly. A test proves a deleted Account leaves no
      Footing rows.
- [ ] Mappers in `src/server/db/` are the boundary as usual; nothing outside `src/server/db/` imports
      the generated client.
