# 15: Upload a resume

**Status:** ready-for-agent

**Blocked by:** 11, 13

## What to build

A user uploads a PDF or DOCX resume, sees it appear in their documents, and the text inside it is
extracted and ready to be used. Today `resume-field.tsx` records a filename and nothing else.

**Uploads go browser-direct to Supabase Storage** via a short-lived signed upload URL that the server
mints after checking who is asking. They cannot go through a route handler: Vercel's request body cap
is 4.5 MB and is not configurable — *below* the 5 MB per-file limit this phase wants, so that path
cannot even express the limit.

**The consequence is that no application code ever sees the bytes.** Bucket-level
`allowed_mime_types` and `file_size_limit` from ticket 01 are the only thing enforcing PDF/DOCX-only.
Ticket 01 verified that they fire on this path; if it found otherwise, this ticket needs a different
answer before it starts.

**Storage tenancy is real enforcement, not convention.** Objects are rows in an RLS table and Postgres
evaluates the policy — signing a download URL is itself an RLS-gated read. Three things silently void
that guarantee, and the implementation must contain none of them:

1. **No `service_role`** anywhere. It bypasses RLS entirely *and* leaves the object's owner null, so
   the object is owned by anyone.
2. **No public bucket.**
3. **No long-lived signed URLs.** The expiry parameter is required with no default and there is no
   platform maximum, so the TTL is entirely this application's discipline. Mint per view, 60 to 300
   seconds.

Policies key on both the user's storage prefix and the object's owner, and **there is no UPDATE
policy at all** — which makes "documents are never versioned" a fact at the storage layer rather than
an application convention. Note that these policies use `auth.uid()`, unlike ticket 04's database
policies, and the owner column is text while `auth.uid()` returns a uuid, so the cast is mandatory.

**Create the database row before anything reaches the bucket.** A pending row first means nothing can
exist in storage that the database never knew about. The row is completed when the upload confirms.

**Extraction happens at upload, in-request** — `unpdf` for PDF and `mammoth` for DOCX, both pure JS
with no native binaries. Extracting at upload is cheaper than at use across repeated generation, the
extracted text is the natural content hash, and failures surface while the user is standing there
rather than inside work they navigated away from. A PDF with no text layer parses fine and yields
roughly zero characters, which is how the no-text-layer case is detected; what happens next is ticket
19's problem.

**The cap is three documents per user, as a named constant, not a literal 3.** The UI expresses it
before the user hits it, per ticket 13.

## Acceptance criteria

- [ ] A user uploads a PDF and a DOCX and both appear in their documents with text extracted
- [ ] The upload goes browser-direct; no document bytes pass through a route handler or a Server Action
- [ ] A file over the size cap and a file of a disallowed type are both rejected, and the rejection is
      shown to the user
- [ ] Signed URLs are minted per view with a TTL of 300 seconds or less, and a test asserts the bound
- [ ] No `service_role` key exists in application code, enforced by a test or a lint rule
- [ ] The bucket is private and no UPDATE policy exists on objects
- [ ] A cross-user test proves user B cannot list, download, or sign a URL for user A's object
- [ ] The database row is created before the object exists, and a test proves an abandoned upload
      leaves a pending row rather than an orphaned object
- [ ] The document cap is a named constant, and reaching it is communicated before the fourth upload
      is attempted
- [ ] A PDF with no text layer is detected at upload rather than surfacing later as empty text
