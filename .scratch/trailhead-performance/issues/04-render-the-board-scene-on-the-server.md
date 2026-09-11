# 04: Render the board's trail scene on the server

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

The illustrated trail scene at the foot of the board is static SVG with no interactivity. The board view, a client component, imports it directly. As a result:
- the scene's drawing code ships in the board's JavaScript
- the scene is rebuilt on every render of the board, which is every time the jobs cache changes: an optimistic stage change, a refetch on focus, a Job added

After this ticket, the scene is rendered once on the server and passed into the board. Its code is not part of the board's client JavaScript, and changes to Jobs no longer re-render it. The board looks exactly as it does today.

The Vercel React best-practices review found this (`rendering-hoist-jsx`).

## Acceptance criteria

- [x] The board's client JavaScript no longer includes the trail scene's code, confirmed from a production build.
- [x] Moving a Job's Stage or adding a Job does not re-render the scene.
- [x] The board is visually unchanged: the scene sits in the same place, and the board still does not overflow at 320, 768, 1024, or 1440 px.
- [x] The board's axe and responsive e2e checks pass unchanged.
- [x] The landing and sign-in pages, which also use the scene, are unchanged.

## Comments

**Done.** The board page renders the trail scene on the server and passes it to the board as a prop.
- **Bundle:** the board's first-load JavaScript no longer contains the scene's code; see ticket 01's comment for the build measurement.
- **Re-renders:** a component test renders the board with a scene that counts its renders, moves a Job to Offer, waits for the card to arrive in that column, and the scene has still rendered once.
- **Visuals:** the board's responsive and axe e2e checks pass at all four widths. The landing and sign-in pages still render the scene themselves, unchanged.
