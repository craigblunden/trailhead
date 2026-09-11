import type { BrowserContext } from "@playwright/test";

import {
  FAKE_PROVIDER_PORT,
  FAKE_PROVIDER_SLOT,
  newProviderUserId,
  startFakeProvider,
  type FakeProvider,
} from "../tests/fakes/oauth-provider";
import { SIGNED_OUT, createJob, expect, newAccount, signUpAndVerify, test } from "./fixtures";

/**
 * Social sign-in end to end (ticket 07), through the real buttons, the real browser client, the
 * real local Auth server, and the app's real `/auth/callback`.
 *
 * The one thing that cannot be real is Google or GitHub: OAuth apps cannot be created from this
 * repository. So the web server runs with placeholder credentials (`playwright.config.ts`) to make
 * the buttons render, and at the network edge the provider a button asked Auth for is swapped for
 * the fake provider standing in Auth's test-only slot. Everything either side of that swap — PKCE
 * verifier cookie, Auth's identity linking, the code exchange, the landing — runs as shipped.
 */

const AUTH_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321").origin;

// One fake provider on one fixed port (Auth's config names it), so these run in one worker.
test.describe.configure({ mode: "serial" });
test.use({ storageState: SIGNED_OUT });

let provider: FakeProvider;
test.beforeAll(async () => {
  provider = await startFakeProvider();
});
test.afterAll(async () => {
  await provider.close();
});

/**
 * Swaps the provider a button asked Auth for with the fake one, and returns the providers the
 * browser asked for.
 *
 * Auth then sends the browser to the provider at `host.docker.internal`, the name Docker gives the
 * host, where the fake listens on loopback only. A redirect a routed request starts is not routed
 * again, so that hop is played here: Auth's redirect is fetched unfollowed, the fake's consent
 * screen answers it, and the browser is handed straight on to Auth's own callback.
 */
async function routeProviderToFake(context: BrowserContext): Promise<string[]> {
  const requested: string[] = [];
  await context.route(
    (url) => url.origin === AUTH_ORIGIN && url.pathname === "/auth/v1/authorize",
    async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.searchParams.get("provider") ?? "");
      url.searchParams.set("provider", FAKE_PROVIDER_SLOT);

      const toProvider = await route.fetch({ url: url.toString(), maxRedirects: 0 });
      const location = toProvider.headers()["location"];
      expect(location, "Auth redirects to the provider").toContain(`:${FAKE_PROVIDER_PORT}/`);
      const toAuthCallback = await provider.authorize(location);
      await route.fulfill({ status: 302, headers: { location: toAuthCallback } });
    },
  );
  return requested;
}

test("SOC-8: both providers are offered on sign-in and on sign-up, each named", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  }
});

for (const { label, id, from } of [
  { label: "GitHub", id: "github", from: "/login" },
  { label: "Google", id: "google", from: "/signup" },
] as const) {
  test(`SOC-9: continuing with ${label} as the owner of an existing password account reaches the same user and the same jobs`, async ({
    page,
    context,
  }) => {
    const account = await signUpAndVerify(page);
    const { role } = await createJob(page);
    // Drop the session without revoking it, as a different browser on another day would be.
    await context.clearCookies();

    const requested = await routeProviderToFake(context);
    provider.setIdentity({ providerUserId: newProviderUserId(), email: account.email, emailVerified: true, name: account.name });
    await page.goto(from);
    await page.getByRole("button", { name: `Continue with ${label}` }).click();

    await expect(page).toHaveURL(/\/board$/);
    expect(requested).toEqual([id]);
    await expect(page.getByRole("link", { name: role, exact: true })).toBeVisible();
  });
}

test("SOC-10: a first-time social sign-in lands on a new, empty board", async ({ page, context }) => {
  await routeProviderToFake(context);
  const stranger = newAccount("social-new");
  provider.setIdentity({ providerUserId: newProviderUserId(), email: stranger.email, emailVerified: true, name: "Dana Okafor" });

  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();

  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { name: "No roles on the board yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Account menu for Dana Okafor/ })).toBeVisible();
});

test("SOC-11: declining at the provider lands back on sign-in with a way forward", async ({ page, context }) => {
  await routeProviderToFake(context);
  provider.setIdentity({ providerUserId: newProviderUserId(), email: newAccount().email, emailVerified: true, name: "x", deny: true });

  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();

  // Auth reports the refusal in the fragment, which the browser carries across the redirect.
  await expect(page).toHaveURL(/\/login\?error=oauth(#.*)?$/);
  await expect(page.getByText(/couldn.t finish signing you in with that provider/)).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});
