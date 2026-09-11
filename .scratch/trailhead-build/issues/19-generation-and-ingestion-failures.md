# 19: Generation and ingestion failure paths

**Status:** ready-for-review

**Blocked by:** 18

## What to build

Every way generation and document ingestion can fail has a designed outcome the user can act on.
Ticket 18 shipped the happy path and the quota; this ticket makes the unhappy paths honest.

**A refusal returns HTTP 200.** Claude signals it through the stop reason, so code that reads the
content without checking first renders a refusal as a blank letter and the user sees a bug. Check the
stop reason before reading content — this is the single most likely defect in the whole feature.

The generation paths:

- An errored or refused call, distinguished from each other in what the user is told.
- A timeout, given generation runs in-request behind a 10-to-25-second pending state.
- **Whether anything retries, and whose act a retry is.** An automatic retry on a $0.18 call
  interacts directly with ticket 18's quota decision; make the two consistent.

The ingestion paths, all of which surface while the user is present, which is the point of extracting
at upload:

- A scanned or image-only PDF with no text layer. This is where the direct-PDF fallback would be used
  if it is kept — handing Claude the PDF itself works and preserves layout, but costs six to eight
  times the input tokens because every page is rasterised, on the app's only unbounded-cost surface.
  **Decide here whether to keep the fallback.** If it is dropped, this becomes a plain user-facing
  rejection, which is a legitimate answer.
- A password-protected file.
- A file whose type contradicts its extension.
- A file over the cap.
- **A file that uploads successfully but fails extraction** — the object exists and the row exists, but
  the document is unusable. Does it stay visible and marked unusable, or does the sweep from ticket 16
  take it? Decide, do not leave it to whichever code path runs first.

## Acceptance criteria

- [ ] The stop reason is checked before content is read, with a test that drives a refusal and asserts
      the user sees an explanation rather than an empty letter
- [ ] An API error and a timeout each render a distinct, actionable state
- [ ] Retry behaviour is decided, documented, and consistent with the quota rule from ticket 18
- [ ] Whether the direct-PDF fallback is kept is decided and recorded here, with the token-cost
      tradeoff stated
- [ ] Each ingestion failure — no text layer, password-protected, type mismatch, oversize — renders a
      specific message naming what to do, tested with a real file of that kind
- [ ] The uploaded-but-unextractable case has one owner: either it stays and is marked, or it is swept,
      and a test proves whichever was chosen
- [ ] No failure path leaks an API error, a stack trace, or a storage key to the client

## Comments

### 2026-09-11 — agent

**Built across tickets 15 and 18; recorded here.**

**Generation failures** (`src/server/generation/cover-letter.ts`, `src/lib/generation.ts`):

- **The stop reason is checked before any content is read.** `refusal` → `refused`, even when the
  response carries a scrap of text (`GEN-C2` sends exactly that); `max_tokens` → `truncated`; an
  empty letter → `failed`. The card shows the explanation, never an empty letter (`GEN-U4`, and the
  e2e run against the fake API).
- **Error and timeout are distinct states.** `Anthropic.APIConnectionTimeoutError` → `timed-out`
  (504, "Writing took longer than it should…"); any other API or connection error → `failed` (502,
  "The writing service had a problem… try again in a minute"). Each renders its own message with Try
  again (`GEN-C3`, `GEN-C4`, `GEN-U5`; e2e drives a 529 and a hang past the timeout).
- **Retry — decided.** Nothing retries automatically: the SDK runs with `maxRetries: 0`. **A retry
  is the user's act**, the Try again button. That is consistent with ticket 18's quota rule because
  **every failure gives the reserved letter back**: a retry costs the user nothing, and the
  application at most one more call per deliberate click. Refusals before any output are not billed;
  errors and timeouts are not something a user can induce on purpose.
- Separate from all of this, the call opts into Anthropic's **server-side refusal fallback**
  (`fallbacks: "default"`), so some declines are rescued inside the same request before the app ever
  sees a refusal.

**The direct-PDF fallback — dropped.** Handing Claude the PDF itself would rescue a scanned resume,
but every page is rasterised and billed as an image *on top of* its text: roughly 1,500–3,000 text
tokens plus up to ~4,800 image tokens per page, about **6–8× the input tokens** of the ~1,500–2,000
tokens of extracted text a two-page resume costs (research 03 §1.5) — on the application's only
unbounded-cost surface, every time a letter is written. It would also leave no stored text and a
second ingestion path to keep working. So a PDF with no text layer is **refused at upload**, with a
message that names the fix (export from the original, or run text recognition).

**Ingestion failures** (`src/server/ingest/extract.ts`), each with its own message in
`UPLOAD_REFUSALS`, each tested with a real file of that kind (`tests/fixtures/documents/`):

| Failure | How it is detected | Tested by |
| --- | --- | --- |
| No text layer | parses, yields < 50 non-space characters | `scan.pdf` — unit, integration, e2e |
| Password-protected | PDF: pdf.js `PasswordException`; DOCX: an OLE2 container, not a ZIP (mammoth cannot tell) | `locked.pdf` (RC4, real user password), `locked.docx` (`officecrypto-tool`) — unit |
| Type contradicts extension | magic bytes, both directions; a ZIP that is not a Word document | `pdf-named-as.docx`, `resume.docx` declared as PDF — unit |
| Oversize | browser pre-check; the upload schema; the bucket's own 5 MB limit on the signed PUT | component (`DOC-3`), integration (a 6 MB PUT refused by Storage) |
| Too many pages | page count checked before extraction (20) | `long.pdf` — unit, e2e |
| Unreadable | either parser throws | generated noise, a truncated PDF — unit |

**The uploaded-but-unextractable case has one owner: the delete path.** The row is marked `failed`
with its reason, then tombstoned, the object removed through the Storage API, and the row deleted —
exactly as a delete — while the refusal is shown to the user holding the file. It never sits in the
list and never takes a slot. If the removal fails, the tombstone goes to ticket 16's sweep like any
other. Proven in `tests/integration/documents.test.ts` ("a PDF with no text layer is refused at
upload, and neither its row nor its object is kept").

**No failure path leaks internals.** Actions and the route return only the written messages above;
logs carry the operation, the tenant id, and the error's name and message — never the prompt, the
response, or the raw error. Asserted: the refusal result carries no storage key, user id, or parser
text (`documents.test.ts`); the Claude failure log line holds no resume or description text
(`GEN-C3`); a database outage reaches the client as a generic message (`ERR-1`, ticket 12).

**Status:** ready-for-review
