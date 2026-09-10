# 17: Pick an existing document for a job

**Status:** ready-for-agent

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

## Acceptance criteria

- [ ] A user attaches an existing document to a job without re-uploading it
- [ ] The same document is attached to more than one job, and detaching from one leaves the others
      untouched
- [ ] Uploading a new document is reachable from the picker and lands attached to the job in hand
- [ ] A job displays which document is attached, and the user can change or remove it
- [ ] Attaching a document the user does not own is impossible, proven by a cross-user test
- [ ] The picker produces zero axe violations, is keyboard-operable, and does not overflow at 320,
      768, 1024, or 1440px
