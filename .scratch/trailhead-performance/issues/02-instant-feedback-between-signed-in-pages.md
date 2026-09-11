# 02: Instant feedback when moving between signed-in pages

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

Moving between Board, Contacts, Documents, and a Job currently shows nothing until the server finishes two things:
- checking the session with Supabase Auth, which is a network round trip
- reading the Tenant's data

No signed-in route has a loading state. The board even has its own "Loading your trail…" state, but it never appears on navigation, because the server has already waited.

After this ticket, a navigation shows a loading state immediately, and the page replaces it when the render completes. The user always sees that their click landed.

The server must **keep awaiting its prefetch** before hydrating. That is deliberate, and it is documented where the prefetch helper lives. Hydrating a still-pending query would let a snapshot read before a write committed overwrite newer optimistic state. A loading state around the page gives the user feedback without changing that.

The Vercel React best-practices review found this (`async-suspense-boundaries`).

## Acceptance criteria

- [x] Navigating to the board, the contacts list or a Contact, the documents page, and a Job's page each shows a loading state straight away while the server render is in progress.
- [x] The loading state keeps the page's header and layout, so nothing jumps when the content arrives, and it does not overflow at 320, 768, 1024, or 1440 px.
- [x] The loading state is announced to assistive technology (a status region), and has no axe violations at the four WCAG rule sets.
- [x] The server prefetch is still awaited. The existing e2e test that navigates while a mutation is in flight still ends on the confirmed state.
- [x] A hard load and a navigation both still redirect a visitor with no valid session exactly as before.

## Comments

**Done.** Three loading states, one per boundary Next actually shows on a navigation:
- **The signed-in shell:** moving between Board, Contacts, and Documents. It sits above the contacts layout, which reads the session and prefetches the list, and a loading state never covers the layout in its own folder.
- **The board:** moving between the board and a Job's page, below the layout that keeps the job store mounted.
- **Contacts:** moving between Contacts. The list stays, and only the detail side waits.

Each shows the page's header and an announced "Loading…". The server prefetch is still awaited.

- **Found by the full e2e run:** a live account menu in the loading state's header would open under a click and then close when the page's own header replaced it. ACC-3, ACC-8, PWR-1, and PWR-2 failed on exactly that. While loading, the header now draws the account menu as a placeholder, and all four pass.
- **A consequence of streaming, for the record:** a page that finds no valid session behind a cookie now redirects on the client, and the response status is 200 rather than 307. The URL a visitor ends on is unchanged; ACC-5 and ACC-6 pass.
- **Tests:** `e2e/loading-states.spec.ts` holds each navigation's server render for 8 seconds, then checks that the loading state appears at once, is announced, has no axe violations, and does not overflow at the four widths. It covers board → Documents, board → a Job, and Contact → Contact, and the pages arrive afterwards.
