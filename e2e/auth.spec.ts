import type { Page } from "@playwright/test";

import { SIGNED_OUT, expect, newAccount, signIn, signOut, signUpAndVerify, test } from "./fixtures";
import { waitForMail } from "./mail";

/** The page's own alert, not Next's route announcer (which also carries role="alert"). */
const alertOn = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe("accounts (ticket 05)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("ACC-1: sign up, verify, land on an empty board, sign out, sign back in", async ({ page }) => {
    const account = await signUpAndVerify(page);

    // A new account's board is empty — Phase 1's empty state, no seeded demo jobs.
    await expect(page.getByRole("heading", { name: "No roles on the board yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Account menu for Sam Rivera/ })).toBeVisible();

    await signOut(page);
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, account);
    await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();
  });

  test("ACC-2: signing in before verifying explains itself and offers to resend", async ({ page }) => {
    const account = newAccount("unverified");
    await page.goto("/signup");
    await page.getByLabel("Full name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = alertOn(page);
    await expect(alert).toContainText("hasn’t been verified yet");
    const resentAfter = Date.now() - 1_000;
    await alert.getByRole("button", { name: /Resend verification email/ }).click();
    await expect(alert).toContainText("Sent.");
    const mail = await waitForMail(account.email, /confirm/i, { after: resentAfter });
    expect(mail.links.some((href) => href.includes("/auth/confirm"))).toBe(true);
  });

  test("ACC-3: signing up with an already-registered address looks exactly like a new one", async ({
    page,
    browser,
  }) => {
    const existing = await signUpAndVerify(page);
    await signOut(page);

    // A second, clean browser: the one an attacker probing for accounts would use.
    const probe = await browser.newContext({ storageState: SIGNED_OUT });
    const probePage = await probe.newPage();
    const fresh = newAccount("fresh");

    const outcomes: string[] = [];
    for (const email of [existing.email, fresh.email]) {
      await probePage.goto("/signup");
      await probePage.getByLabel("Full name").fill("Probe");
      await probePage.getByLabel("Email").fill(email);
      await probePage.getByLabel("Password").fill(existing.password);
      await probePage.getByRole("button", { name: "Create account" }).click();
      await expect(probePage.getByRole("heading", { name: "Check your email" })).toBeVisible();
      outcomes.push((await probePage.locator("main").innerText()).replace(email, "<email>"));
    }
    expect(outcomes[0]).toBe(outcomes[1]);
    await probe.close();
  });

  test("ACC-4: a short password is refused server-side with the same limit the form shows", async ({
    page,
  }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Password")).toHaveAttribute("minlength", "8");
    // Bypass the browser's own constraint validation to reach the server's.
    await page.getByLabel("Password").evaluate((el) => el.removeAttribute("minlength"));
    await page.getByLabel("Full name").fill("Sam Rivera");
    await page.getByLabel("Email").fill(newAccount().email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByLabel("Password")).toHaveAccessibleDescription(/at least 8 characters/i);
    await expect(alertOn(page)).toBeVisible();
  });

  test("ACC-5: a signed-out visit to any board URL lands on sign-in", async ({ page }) => {
    for (const path of ["/board", "/board/anything-at-all"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("ACC-6: a forged session cookie gets past the proxy and no further", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ storageState: SIGNED_OUT });
    const { hostname } = new URL(baseURL!);
    // Well-formed enough for the proxy's cookie-only check: a session that claims not to expire
    // for an hour. Nothing about it is signed by Auth.
    const forged = {
      access_token: "forged",
      refresh_token: "forged",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: "base64-" + Buffer.from(JSON.stringify(forged)).toString("base64url"),
        domain: hostname,
        path: "/",
      },
    ]);
    const page = await context.newPage();

    // The proxy's optimistic check sees "a session" and lets the request through to the page…
    await page.goto("/board");
    // …where the real session check finds nothing valid and sends it back. No board, no data.
    await expect(page).toHaveURL(/\/login\?session=ended$/);
    await expect(page.getByText("Your session has ended.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your trail" })).toHaveCount(0);

    // And the cookie is gone: the next visit is a plain signed-out one, not a loop.
    const remaining = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(remaining).toEqual([]);
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });

  test("ACC-8: sign out is a submit control, clears the session, and lands on the landing page", async ({
    page,
  }) => {
    // Its own account: signing out revokes the session everywhere, and the shared worker account
    // has other tests still running on it.
    await signUpAndVerify(page);
    await page.getByRole("button", { name: /Account menu/ }).click();
    const item = page.getByRole("menuitem", { name: "Sign out" });
    await expect(item).toHaveJSProperty("tagName", "BUTTON");
    await item.click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/board");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("signed in (ticket 05)", () => {
  test("ACC-7: a signed-in visit to sign-in or sign-up lands on the board", async ({ page }) => {
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/board$/);
    }
  });
});
