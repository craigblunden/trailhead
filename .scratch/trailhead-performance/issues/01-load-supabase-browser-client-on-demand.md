# 01: Load the Supabase browser client only when it's needed

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

The browser uses the Supabase JS client for exactly two things:
- putting a Document's bytes into Storage through a signed upload URL
- starting a social sign-in redirect

Today every signed-in page downloads it anyway:
- The documents client is created when its module loads, and the signed-in shell wraps every page in the documents provider. So the board, contacts, documents, and job pages all ship the client, whether or not anyone uploads.
- The sign-in and sign-up pages ship it too, through the social sign-in buttons. That includes a deployment with no provider credentials, where the buttons render nothing at all.

After this ticket, the client loads at the moment it is used: when an upload starts, or when someone presses "Continue with Google / GitHub". Nobody should notice any difference except smaller pages.

The Vercel React best-practices review found this (`bundle-conditional`, `bundle-dynamic-imports`). The size of the saving hasn't been measured yet; this ticket measures it.

## Acceptance criteria

- [x] A production build of the board, contacts, documents, and job pages no longer includes the Supabase JS client in the JavaScript each page loads up front. The same is true of the sign-in and sign-up pages.
- [x] The before-and-after first-load JavaScript for those pages is recorded in a comment on this ticket.
- [x] Uploading a Document still goes straight from the browser to Storage, never through the application. The existing documents and application-kit e2e journeys pass unchanged.
- [x] A refused upload (too large, wrong type) still shows the same written refusal.
- [x] Social sign-in still completes a real OAuth round trip in the existing integration and e2e suites.
- [x] A page with no social providers still renders no buttons, and loads nothing extra.
- [x] No test fakes or component tests need to know about the lazy load; they keep injecting their own clients.

## Comments

**Done.** The documents client and the social sign-in client both import `@supabase/ssr` at the moment they use it: when an upload's PUT starts, and when "Continue with…" is pressed. A unit test in the boundaries suite fails if any browser-side module imports it statically again.

First-load JavaScript from production builds, gzipped (raw in brackets):

| Page | Before | After |
| --- | --- | --- |
| Board | 270.1 KB (917) | 214.8 KB (695) |
| A Job's page | 282.9 KB (959) | 228.6 KB (740) |
| Contacts | 275.0 KB (931) | 220.6 KB (712) |
| A Contact | 278.8 KB (942) | 224.4 KB (723) |
| Documents | 267.0 KB (907) | 212.5 KB (688) |
| Sign in, sign up | 215.9 KB (751) | 149.4 KB (497) |

- **Method:** each route's client entry chunks plus the root main files, read from the build's client reference manifests, gzip level 9.
- **After the change:** no route's first-load chunks contain the Supabase client.
- **Board caveat:** the board's "after" also includes ticket 04, which moved the trail scene out; every other row is this ticket alone.
- **Tests:** the documents and application-kit e2e journeys pass, and so do social sign-in SOC-8 to SOC-11 (a real OAuth round trip).
