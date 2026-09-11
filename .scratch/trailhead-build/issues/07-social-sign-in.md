# 07: Social sign-in, feature-flagged off without credentials

**Status:** ready-for-review (hosted provider sign-in check pending on the user)

**Blocked by:** 05

## What to build

A user signs in with Google or GitHub instead of managing another password, and a developer who
clones the repo without OAuth credentials still gets a working app.

**The flag is not optional polish.** OAuth apps and callback URLs cannot be created from this repo, so
a clean clone will not have them. When the client id and secret for a provider are absent, that
provider's button does not render and nothing about the app is broken. This is what makes "clone and
run" true.

**Account linking is the trap.** An account created by email and password, and a social identity
carrying the same *verified* address, must resolve to one user — not two accounts silently diverging,
with the user's board in whichever one they signed into first. Supabase has a position on this;
confirm what it actually does rather than assuming, and test it.

OAuth requires a browser redirect, so sign-in is initiated client-side, unlike every other auth path
in this phase.

## Acceptance criteria

- [ ] Google and GitHub sign-in both complete and land the user on their own board
- [ ] Signing in socially with an address that already has an email-and-password account reaches the
      same user and the same jobs, proven by a test
- [ ] With a provider's credentials absent from the environment, its button does not render and the
      app runs normally
- [ ] Provider buttons have accessible names that name the provider, not an unlabelled icon
- [ ] Buttons appear on both `/signup` and `/login`

## Comments

### 2026-09-11 — agent

**Built.**

- `src/lib/social-providers.ts` — the flag. `enabledSocialProviders(env)` offers a provider only when
  **both** `SUPABASE_AUTH_EXTERNAL_<P>_CLIENT_ID` and `_SECRET` are non-blank, in a stable order
  (Google, GitHub). Values are tested for presence only; what reaches the page is `{ id, label }`.
- `src/components/auth/social-sign-in.tsx` — "Continue with Google / GitHub" on **both** `/login`
  and `/signup` (the provider decides whether the account is new). Renders nothing with no
  providers. Marks are inline SVGs with `aria-hidden` (lucide 1.x has no brand icons), so each
  button's name is its text. Pressing one announces "Taking you to …" through a live region and
  disables both; a failure to start says so in an alert and hands them back; a bfcache return
  re-enables them.
- `src/lib/social-sign-in-client.ts` — sign-in starts client-side, as OAuth needs: the
  `@supabase/ssr` browser client, PKCE, `redirectTo` = `<origin>/auth/callback`.
- `src/app/auth/callback/route.ts` — exchanges the code (verifier from the cookie) and lands on
  `/board`. A refusal at the provider, a refusal by Auth, a missing
  code, or a failed exchange all land on `/login?error=oauth` with a notice; the reason is logged
  through `logError` without the code, and no provider text is rendered. Auth reports a refusal
  in the query (logged, e.g. `provider returned access_denied`) and again in the URL **fragment**,
  which the browser carries into the `/login` URL. `proxy.ts` already excludes the route.

**Account linking: what Supabase Auth actually does** (gotrue v2.196.0, the local stack), pinned by
`tests/integration/social-linking.test.ts` through real OAuth round trips:

| Situation | Outcome |
| --- | --- |
| Verified password account + social identity with the same **verified** address | Same user id, both identities, password still works (LINK-1) |
| … + the provider did **not** verify the address | Refused, `provider_email_needs_verification`, no second account (LINK-2) |
| Unverified password sign-up squatting the address + owner's verified social identity | Owner gets the row; Auth strips the unverified password identity; the squatter's password fails (LINK-3) |
| Social account first, then a password sign-up for the address | "User already registered"; no second account (LINK-4) |
| Returning provider account whose address changed | Matched by (provider, provider user id) before email (LINK-5) |

One side effect to know about: linking replaces `user_metadata.full_name` with the provider's name,
so the header's display name can change after the first social sign-in.

**How it is tested without Google or GitHub.** OAuth apps cannot be created from this repo, so
`supabase/config.toml` enables a **test-only** provider in Auth's `gitlab` slot (the one whose URL
Auth lets you override), pointed at `tests/fakes/oauth-provider.ts` on `127.0.0.1:54399`. No button
offers it. Auth's linking decision is provider-agnostic, so the integration suite proves the rule
there. `e2e/social-sign-in.spec.ts` drives the **real** Google and GitHub buttons: the web server
runs with placeholder credentials (`playwright.config.ts`), and Playwright swaps the provider at the
network edge (`/auth/v1/authorize?provider=github` → the test slot). A redirect that a routed request
starts is not routed again, and the browser cannot reach the loopback-only fake at
`host.docker.internal`. So the route fetches Auth's redirect unfollowed, plays the fake's consent
step, and hands the browser straight to Auth's callback. PKCE cookie, Auth, the code
exchange, and the landing all run as shipped. The placeholder credentials also mean the a11y and
responsive sweeps now cover the buttons on `/login` and `/signup`.

Tests: `tests/lib/social-providers.test.ts` (SOC-1), `tests/components/social-sign-in.test.tsx`
(SOC-2–5, axe), `tests/components/auth-pages.test.tsx` (SOC-12: both pages rendered by the
server with and without credentials), `tests/server/auth-callback.test.ts` (SOC-6–7), integration LINK-1–5, e2e SOC-8
(both buttons on both pages), SOC-9 (GitHub from `/login` and Google from `/signup`, each onto an
existing password account's **same jobs**), SOC-10 (first-time social user → new empty board),
SOC-11 (declined at the provider → `/login` notice).

**Acceptance criteria**

- Google and GitHub sign-in complete and land on the user's own board — **partial: met for
  everything this repo owns** (e2e SOC-9, SOC-10, through the real buttons and callback). The provider's own
  consent screen and Auth's Google/GitHub adapters can only be exercised with real OAuth apps:
  step 8 of `docs/provisioning.md` asks the operator to sign in once with each on the deployment.
- Same address → same user and same jobs — **met** (LINK-1, SOC-9).
- No credentials → no button, app runs normally — **met** (SOC-1, SOC-2, and SOC-12 at page level:
  both forms work and no provider button renders). The e2e server deliberately runs *with*
  placeholder credentials so its sweeps cover the buttons, so this criterion is not shown at e2e
  level.
- Accessible names name the provider — **met** (SOC-3, e2e SOC-8).
- Buttons on both `/signup` and `/login` — **met** (SOC-8).

Local stack change: the new `[auth.external.gitlab]` block needs `npm run supabase:stop` /
`supabase:start` once to take effect.


**Known limitations, from review.**
- The flag reads the app's environment, as this ticket defines it, not whether Auth has the provider
  enabled. If Vercel carries the credentials but the Auth dashboard does not enable the provider,
  the button renders and leads to Auth's raw JSON error page. `signInWithOAuth` builds the URL
  without calling Auth, so the SOC-5 alert cannot catch it. Keep the two in step (provisioning
  step 8).
- Linking replaces `user_metadata.full_name` with the provider's name (see above). Not handled.
- Locally, anything listening on `127.0.0.1:54399` can hand the local Auth server a verified
  identity for any address. It affects dev data only; the only guard against pushing the test slot
  is the comment in `config.toml`.

**Review (standards + spec) applied:**
- The status live region stays mounted.
- The provider id type derives from the list.
- The callback no longer takes an unused `next`.
- The fake provider's helpers are shared, and `subject` became `providerUserId`.
- SOC-12 was added.

**Status:** ready-for-review (hosted provider sign-in check pending on the user)
