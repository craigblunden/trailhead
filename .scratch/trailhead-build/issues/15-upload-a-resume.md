# 15: Upload a resume

**Status:** ready-for-review

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

## Comments

### 2026-09-11 — agent (built with ticket 16; one data layer)

**Built.**

- **Browser-direct upload, row first.** `startUploadAction` validates a description of the file
  (name, kind, size — never bytes), then `startUpload()` (`src/server/data/documents.ts`) creates a
  `pending` row with key `<userId>/<uuid>.<ext>` and only then mints a signed upload URL with the
  user's own session. The browser PUTs straight to Storage (`src/components/documents-actions-client.ts`,
  `createBrowserClient` + `uploadToSignedUrl`), then `finishUploadAction` reads the object back as
  the user, extracts, and marks the row `ready`. The e2e journey watches every request and asserts
  the PUTs went to Storage's signed-upload endpoint and no request to the app carried a file body.
- **Extraction at upload** (`src/server/ingest/extract.ts`): magic bytes first (`%PDF-`, ZIP, OLE2),
  never the name or the declared type; `unpdf` with the page count checked before `extractText`
  (cap 20); `mammoth.extractRawText`; a 20 s race; fewer than 50 non-space characters means the PDF
  has **no text layer**; 150,000 characters max. Refusals are codes with user-facing messages that
  name what to do (`UPLOAD_REFUSALS` in `src/lib/documents.ts`). Research 03 flagged mammoth's
  `browser` field as a bundling risk: the production build resolves the Node entry — the e2e run
  uploads a real DOCX through `next start` and it is read.
- **Cap:** `DOCUMENT_CAP = 3`, checked under `pg_advisory_xact_lock(hashtext(userId))`, so racing
  uploads cannot both take the last slot (tested with three concurrent starts at one held). The UI
  says "Room for N more" wherever upload is offered and replaces the control with "All 3 slots used"
  at the cap.
- **Signed download URLs:** `DOWNLOAD_URL_TTL_SECONDS = 120`, minted per click with `download=<name>`,
  never stored or listed. The integration test decodes the token and asserts `exp − iat`.
- **No `service_role`:** `tests/server/storage-guards.test.ts` greps `src/`, `next.config.ts`, and
  `.env.example` (comments stripped). The same file pins the bucket config to the constants and
  asserts there is no UPDATE policy in the provisioning migration; the integration test reads
  `pg_policies` and fetches a real object's public URL (not 200).
- **Pages:** `/documents` (list with kind, size, date, "On N jobs"; upload; download; delete) and a
  Documents link in the header nav.

**What an abandoned upload leaves:** a `pending` row and no object — proven by hooking the mint to
check that the row already exists and the object does not. The sweep (ticket 16) reclaims it.

**Decided here for ticket 19** (recorded there too): an upload that cannot be used — no text layer,
locked, mismatched, unreadable — **is not kept**. It is marked `failed` with its reason, removed by
the same tombstone → object removal → row deletion path as a delete, and the refusal is shown while
the user is holding the file. It never occupies a slot.

**Fixtures:** `tests/fixtures/documents/` holds real files — a text PDF, an image-only PDF, a PDF
encrypted with the standard security handler (RC4, a real user password), a 21-page PDF, a DOCX, a
password-protected DOCX (encrypted by `officecrypto-tool`), and a PDF under a `.docx` name — plus
the generator that made them.

**Tests:** `tests/server/extract.test.ts` (8, node environment), `tests/server/storage-guards.test.ts`
(4), `tests/integration/documents.test.ts` (16, against the real bucket with two real verified
accounts), `tests/components/documents.test.tsx` (8, including axe), `e2e/documents.spec.ts` (the
full journey, axe, and no overflow at 320/768/1024/1440).

**Found while testing:** the Download and Delete buttons first used an sr-only file name, which JSX
joined without its space ("Deleteresume.pdf" to a screen reader). They use `aria-label` now.

**Status:** ready-for-review
