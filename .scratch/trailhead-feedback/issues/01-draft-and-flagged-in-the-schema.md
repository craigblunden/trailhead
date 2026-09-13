# 01: The Draft on the Job, `flagged` on the quota week

**Status:** done

## What to build

One migration, two models, one DTO, two Activity labels. The glossary terms are Draft, Flag, Hold
(`CONTEXT.md`); storing the Draft is ADR-0002.

**Job gains its Draft.** Two columns: the Draft's text, defaulting to empty, and when it was written,
nullable. No new table: a Job has at most one Draft, replaced by each write, and it goes with the
Job. The tenant policy already covers every Job column.

**GenerationQuota gains `flagged`**, an integer defaulting to zero: this week's Flags. The Hold is
derived (`flagged >= 2`), never stored, so it lapses on Monday with the letter count. The row is
tenant data under the existing policy. Document, beside the Plan script's dashboard SQL, the one
statement that lifts a Hold early as the migrator: zero `flagged` for that user and week.

**The Job DTO carries the Draft** (text and written-at) beside its resume and cover letter, through
the mapper. The job page's query and the cache therefore have it without a second read.

**Activity labels**: "Cover letter written" and "Cover letter rewritten". Put them where the other
system-written labels live so the data layer and tests share one spelling. Writing them is issue 04's.

**The seed**: the mid-search account's Harvest job gets a Draft, so the job page shows one on the
first visit to it. Nothing seeded is flagged.

## Acceptance criteria

- [ ] A migration adds both columns; an applied migration is never edited
- [ ] The Job DTO exposes the Draft, and a Job without one reads as empty text and null written-at
- [ ] Deleting a Job leaves no Draft anywhere (it was a column, so this is by construction; assert it)
- [ ] The isolation suite covers the new columns like any other Job and GenerationQuota field
- [ ] `UserPlan` is untouched; the migrator SQL to lift a Hold is documented
- [ ] Typecheck, lint, and the existing suites pass

## Comments

Done 2026-09-13. Migration `20260913000000_draft_and_flagged` adds `Job.draft` (text, default empty),
`Job.draftWrittenAt` (nullable timestamp), and `GenerationQuota.flagged` (default 0); nothing changes in
RLS. The Job DTO carries `draft` and `draftWrittenAt`; `newJobFacts` starts a Job with neither, and a
new pure rule `withDraft` (`src/lib/jobs-rules.ts`) is what both the data layer and the card apply.
Labels are `COVER_LETTER_WRITTEN_LABEL` / `COVER_LETTER_REWRITTEN_LABEL` beside the opening label. The
mid-search seed account's Harvest & Co job carries a Draft written 12 days ago with its "Cover letter
written" entry. The migrator SQL to lift a Hold is under "Lifting a Hold early" in
`docs/provisioning.md`. Not yet applied to the hosted project (as with the Plans migrations).
