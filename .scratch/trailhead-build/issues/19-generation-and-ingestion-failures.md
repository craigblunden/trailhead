# 19: Generation and ingestion failure paths

**Status:** ready-for-agent

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
