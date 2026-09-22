import type { Page } from "@playwright/test";

import { SIGNED_OUT, acceptTerms, expect, newAccount, test } from "./fixtures";
import { uniqueEmail, waitForMail } from "./mail";

/**
 * The disclosure pages and the acceptance gate (terms tickets 01, 02, 04).
 *
 * The social half of the gate — an Account that never renders the sign-up form, which is the whole
 * reason for ADR-0008 — is covered by `SOC-10` in `social-sign-in.spec.ts`, where the fake provider
 * lives.
 */

test.describe("the public pages", () => {
  test.use({ storageState: SIGNED_OUT });

  test("TERMS-E1: /terms and /privacy are readable with no session", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
    await expect(page).toHaveTitle(/Terms/);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
    await expect(page).toHaveTitle(/Privacy/);
  });

  test("TERMS-E2: the privacy page names both providers and quotes what each commits to", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Anthropic" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "TypeSafe" })).toBeVisible();
    await expect(page.getByText("Anthropic may not train models on Customer Content")).toBeVisible();
    await expect(page.getByText("We will not train or fine tune any artificial intelligence")).toBeVisible();
    // The one genuinely unknown thing, said as unknown rather than fogging both companies.
    await expect(page.getByText("No period is published")).toBeVisible();
    await expect(page.getByText(/files you upload are never sent/i)).toBeVisible();
  });

  test("TERMS-E3: both pages are reachable from the landing page and the auth pages", async ({ page }) => {
    for (const path of ["/", "/signup", "/login"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Terms" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Privacy" }).first()).toBeVisible();
    }
  });

  test("TERMS-E4: the sign-up form links to them and has no checkbox of its own", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    // ADR-0008: a checkbox here would miss every social sign-in, so there is none.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });
});

test.describe("the gate", () => {
  test.use({ storageState: SIGNED_OUT });

  /** Signs up and verifies without accepting, so the test meets the gate itself. */
  async function signUpGated(page: Page) {
    const account = { ...newAccount("terms"), email: uniqueEmail("terms") };
    const sentAfter = Date.now() - 2_000;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    const mail = await waitForMail(account.email, /confirm/i, { after: sentAfter });
    await page.goto(mail.links.find((href) => href.includes("/auth/confirm"))!);
    await expect(page).toHaveURL(/\/board$/);
    return account;
  }

  test("TERMS-E5: a new account meets the gate, and nothing else, until it agrees", async ({ page }) => {
    await signUpGated(page);

    const gate = page.getByRole("heading", { level: 1, name: "Before you carry on" });
    await expect(gate).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your trail" })).toBeHidden();

    // Every authenticated route, not just the one it landed on.
    for (const path of ["/documents", "/contacts", "/account", "/interview"]) {
      await page.goto(path);
      await expect(gate).toBeVisible();
    }

    // Unticked, and the submit blocked until it is ticked.
    const agree = page.getByRole("checkbox");
    await expect(agree).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Agree and continue" })).toBeDisabled();

    await agree.check();
    await page.getByRole("button", { name: "Agree and continue" }).click();
    await expect(gate).toBeHidden();
    // Back where they were going — the last route they tried — rather than turfed out to the board.
    await expect(page).toHaveURL(/\/interview$/);
    await expect(page.getByRole("heading", { level: 1, name: "Interview Simulator" })).toBeVisible();
  });

  test("TERMS-E6: the gate links to both pages in full, without losing the place", async ({ page, context }) => {
    await signUpGated(page);

    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: /read the privacy page/i }).click();
    const privacy = await opened;
    await expect(privacy.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
    // The gate is still where it was, in the tab the person was signing in to.
    await expect(page.getByRole("heading", { level: 1, name: "Before you carry on" })).toBeVisible();
  });

  test("TERMS-E7: declining offers only to sign out", async ({ page }) => {
    await signUpGated(page);
    await page.getByRole("button", { name: "Sign out instead" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("TERMS-E8: an account that has agreed does not meet it again", async ({ page }) => {
    const account = await signUpGated(page);
    await acceptTerms(page);
    await expect(page.getByRole("heading", { name: "Your trail" })).toBeVisible();

    await page.goto("/login");
    // Signed in already, so the login page bounces back to the board — where the gate is not.
    await expect(page).toHaveURL(/\/board$/);
    await expect(page.getByRole("heading", { level: 1, name: "Before you carry on" })).toBeHidden();
    expect(account.email).toContain("@");
  });
});
