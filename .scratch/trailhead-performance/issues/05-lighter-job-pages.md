# 05: Lighter job pages: measure the Job list, slim it, and trim the job page's extra work

**Status:** ready-for-review (part 2 not built: the measurement said no-go)

**Blocked by:** None (can start immediately)

## What to build

Three changes, all in how Jobs reach the browser and what the job page does once they're there.

### 1. Measure first, then decide

The board and a Job's page both send the Tenant's **entire** Job list to the browser, each Job with everything on it:
- the description and notes, up to 20,000 characters each
- the activity history
- linked Contacts
- the Application kit

The board's cards read seven fields, and a Job's page needs one Job. These pages read cookies, so they re-render on the server on **every** navigation and send the list again, even when the browser's cache already holds it.

**Start by measuring.** Record the size of the Job list payload on the board and on a Job's page, both on a hard load and on a client navigation. Do it for:
- a realistic board: 30 Jobs with full pasted postings and some activity
- the worst case: 30 Jobs at both text limits

Record the numbers in a comment on this ticket, with a go/no-go for part 2.

### 2. If the numbers say go: send only what each page shows

The board receives a slim list with only what its cards show. A Job's page reads just that Job.

This touches how the jobs cache is keyed, so the behaviour the current single list guarantees must survive:
- **Optimistic writes:** a Stage change, notes, description, salary, and Application kit choices all show immediately and roll back visibly if refused.
- **Navigation:** moving between the board and a Job never shows stale data or reshuffles the board.
- **Stale snapshots:** a navigation that starts while a write is in flight still ends on the confirmed state (the reason the server prefetch is awaited).

If the numbers say no-go, record why and skip part 2.

### 3. Trim the job page's extra work

- **Saving a text field renders twice.** Saving a Job's description, notes, or salary currently causes an extra render of the whole job page when the server's answer arrives. A draft field copies the saved value into its own state in an effect, instead of working it out during render (`rerender-derived-state-no-effect`). The draft behaviour stays exactly as it is:
  - saving after a pause or on blur
  - keeping what the user is typing
  - letting a rolled-back value win once they stop
- **The cover-letter route queries the database before checking it can write a letter.** When no API key is configured, it should say generation is unavailable without reading the Job first (`async-cheap-condition-before-await`).

The Vercel React best-practices review found all three (`server-serialization` for part 1).

## Acceptance criteria

- [x] The Job list payload sizes, for a realistic and a worst-case board, on hard loads and on navigations, are recorded here with a go/no-go.
- [ ] If go: the board's payload carries only what its cards show, and a Job's page carries only that Job. The recorded payload shrinks accordingly.
- [ ] If go: optimistic Stage, notes, description, salary, and Application kit changes still show at once and roll back visibly on refusal. The existing component, integration, and e2e suites for the board and job page pass.
- [ ] If go: the e2e test that navigates while a write is in flight still ends on the confirmed state.
- [x] If no-go: the reason is recorded and the list is unchanged.
- [x] Saving a description, notes, or salary no longer causes an extra render of the job page. A component test proves the draft still:
  - follows the saved value while idle
  - keeps what the user is typing
  - accepts a rolled-back value once they stop
- [x] With no API key configured, the cover-letter route answers "unavailable" without reading the Job. A signed-out request still gets 401, and a foreign Job still gets 404 when a key is configured.

## Comments

**Part 1: measured.** 30 Jobs on one account, each page fetched with the signed-in cookies. The postings are varied prose, so gzip is not flattered by repetition. Navigation payloads were fetched as `RSC: 1` without a router state tree, so they include the shared layouts and are a slight upper bound.

| 30 Jobs with… | Board, hard load | Board, navigation | Job page, hard load | Job page, navigation |
| --- | --- | --- | --- | --- |
| No description or notes | 8.6 KB (44.6 raw) | 5.3 KB (27.7) | 7.0 KB (38.3) | 4.3 KB (24.9) |
| 4,000-character postings, 600-character notes | 40.6 KB (180.1) | 37.0 KB (162.8) | 39.1 KB (173.8) | 36.0 KB (160.0) |
| Both fields at 20,000 characters | 255.1 KB (1,220.5) | 251.7 KB (1,200.3) | 253.6 KB (1,214.2) | 250.5 KB (1,197.5) |

Sizes are gzipped, with raw sizes in brackets.

**Go/no-go: no-go.** The trade-off:
- **Realistic cost:** a busy board with 30 full postings sends about 32 KB gzipped more per navigation than the same board with no text. That is less than the JavaScript ticket 01 removed from every signed-in page.
- **Worst case:** about 250 KB, but only with every Job's description and notes both at the 20,000-character limit.
- **Refactor risk:** part 2 would reshape the jobs cache under every optimistic write (Stage, notes, description, salary, Application kit) and the stale-snapshot protection.

The Job list is unchanged. **Revisit** if real descriptions routinely approach the limit, or if navigation payloads show up in field metrics.

**Part 3: done.**
- **Draft fields:** a job page's draft field follows a new saved value during render instead of in an effect, so what is beneath it renders once. A component test counts those renders, and also proves the draft still follows the saved value while idle, keeps what the user is typing, and lets a rolled-back value win once they stop.
- **Cover-letter route:** it checks for an API key before reading the Job. An integration test posts for a Job that does not exist with no key configured, and gets 503 "unavailable" rather than 404. The existing 401, 404, quota, and refund tests pass.
