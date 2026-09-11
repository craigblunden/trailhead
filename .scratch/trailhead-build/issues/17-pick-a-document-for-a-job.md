# 17: Pick an existing document for a job

**Status:** ready-for-review

**Blocked by:** 15

## What to build

A user attaches one of their documents to a job, and the same resume goes out with as many jobs as
they like. This is the point of promoting documents to the user: today the resume is a property of one
job, recorded as a filename, and reusing it means typing it again.

**Picking is the common case; uploading is the exception.** The per-job dropzone metaphor was built
for a world where each job had its own file. Ticket 13 decided what replaces it — build that, and
leave uploading reachable from the picker rather than making it the default gesture.

**A cover letter can be uploaded and attached too**, even though nothing in this phase reads an
uploaded one. It is a record the user keeps on file, and the document kinds already allow for it.

**What ticket 13 decided** (its Comments carry the reasoning):

- **The picker is a radio list in an "Application kit" card** on the job page: Nothing, then each
  document with its kind and "on N jobs". "Upload another" is a secondary row beneath it, and a new
  upload lands attached. Delete is not here; it lives only on `/documents`.
- **The cap shows wherever upload is offered** ("room for 1 more"). At the cap, the upload row becomes
  "All 3 slots used · Manage documents", so a fourth upload cannot be attempted.
- **A job holds a resume and a cover letter separately.** `Job.documentId` is one column, and the
  prototype showed the consequence: attaching a cover letter through it detaches the resume, leaving
  generation nothing to write from. This ticket adds a nullable `coverLetterId` in a new migration,
  `ON DELETE SET NULL` like `documentId`. It is covered by the same rule as ticket 04's `documentId`
  policy: the referenced row must be visible to the tenant. The kit offers one choice per kind.
  Whether `documentId` is renamed `resumeId` in the same migration is this ticket's call; record it.

## Acceptance criteria

- [ ] A user attaches an existing document to a job without re-uploading it
- [ ] The same document is attached to more than one job, and detaching from one leaves the others
      untouched
- [ ] Uploading a new document is reachable from the picker and lands attached to the job in hand
- [ ] A job displays which document is attached, and the user can change or remove it
- [ ] Attaching a document the user does not own is impossible, proven by a cross-user test
- [ ] A job holds a resume and a cover letter at once, and attaching one never detaches the other
- [ ] A cover letter cannot be set as the job's resume, nor a resume as its cover letter
- [ ] The picker produces zero axe violations, is keyboard-operable, and does not overflow at 320,
      768, 1024, or 1440px

## Comments

### 2026-09-11 — agent

**Built, as ticket 13 decided.**

- **Migration `20260911120000_job_resume_and_cover_letter`.** `documentId` is **renamed to
  `resumeId`** (with its index and foreign key), and a nullable `coverLetterId` is added, both
  `ON DELETE SET NULL`. The call on the rename: the column now means exactly one thing, only the data
  layer reads it, and `ALTER … RENAME` keeps the data — so the clearer name costs nothing. The tenant
  policy on `Job` is recreated: a referenced Document must be visible to the tenant (ticket 04's
  rule), **not tombstoned, and of the right kind**. A cover letter can never be a Job's resume, nor a
  resume its cover letter, even from a write that skips the data layer.
- **Data layer:** `setJobDocument(jobId, kind, documentId | null)` in `src/server/data/documents.ts`.
  Only a ready, live Document of the user's own can be attached; the wrong kind is a `RuleError`
  (`wrong-kind`) with a message naming the problem; a foreign id is the same `NotFoundError` as a
  missing one. The delete path's tombstone now detaches from both columns.
- **Job DTO:** `resumeFile: string | null` is replaced by `resume` and `coverLetter`, each
  `{ id, fileName } | null`. Document summaries count the Jobs using a Document through either
  reference.
- **UI:** the job page's **Application kit** card — per kind, a radio list of Nothing then each ready
  document with "On N jobs" — with **"Upload another"** as a secondary row beneath it, where a new
  upload lands attached. At the cap the row reads "All 3 slots used · Manage documents". Delete is not
  offered here. The choice is optimistic and rolls back visibly with the reason. The Details card no
  longer shows a file name, and the add-job dialog's filename-only resume field is gone: documents
  are attached from the job's own page.

**Tests:** `tests/integration/job-documents.test.ts` (6): one document on two jobs, detaching one
leaves the other; resume and cover letter at once; the wrong kind refused by the data layer, by the
action, and by the policy on a direct write; pending and tombstoned documents cannot be attached;
user B cannot attach A's document (data layer, action, and a direct write); deleting a cover letter
leaves the resume. `tests/components/application-kit.test.tsx` (8, including keyboard operation, the
upload landing attached, the at-cap row, rollback, and axe). `e2e/documents.spec.ts` gains the kit
journey: upload from the kit, reuse on a second job chosen by keyboard, detach from one, zero axe
violations, and no overflow at 320/768/1024/1440. Existing tests that named `documentId` or
`resumeFile` were updated.

**Not committed, flagged:** the uncommitted landing-page rewrite in the working tree
(`src/components/landing/everything-you-need.tsx`) read `job.resumeFile` from `SEED_JOBS`; its two
uses now read `job.resume?.fileName` so the working tree still builds. That file is otherwise
untouched and not part of this commit.

**Status:** ready-for-review
