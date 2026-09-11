import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, expect, newAccount, signOut, signUpAndVerify, test } from "./fixtures";
import { uniqueEmail, waitForMail } from "./mail";
import { BREAKPOINTS } from "./routes";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoAxeViolations(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  for (const width of BREAKPOINTS) {
    await page.setViewportSize({ width, height: 900 });
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${width}px`).toBeLessThanOrEqual(clientWidth);
  }
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  return (await page.locator("main").innerText()).replace(email, "<email>");
}

test.describe("forgot and reset password (ticket 06)", () => {
  test.use({ storageState: SIGNED_OUT });

  test("PWR-1: a registered and an unregistered address render identically", async ({ page }) => {
    const account = await signUpAndVerify(page);
    await signOut(page);

    const sentAfter = Date.now() - 1_000;
    const registered = await requestReset(page, account.email);
    const unregistered = await requestReset(page, uniqueEmail("nobody"));

    expect(registered).toBe(unregistered);
    // …but only one of them gets a mail.
    const mail = await waitForMail(account.email, /reset/i, { after: sentAfter });
    expect(mail.links.some((href) => href.includes("type=recovery"))).toBe(true);
  });

  test("PWR-2: a valid link sets a new password, the old one stops working, and a reused link is refused", async ({
    page,
  }) => {
    const account = await signUpAndVerify(page);
    await signOut(page);

    const sentAfter = Date.now() - 1_000;
    await requestReset(page, account.email);
    const mail = await waitForMail(account.email, /reset/i, { after: sentAfter });
    const link = mail.links.find((href) => href.includes("type=recovery"))!;

    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password$/);
    await expectNoAxeViolations(page);
    await expectNoOverflow(page);

    const fresh = newAccount();
    const newPassword = `${fresh.password}-changed`;
    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText("Password updated.")).toBeVisible();

    // The new password works…
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/board$/);
    await signOut(page);

    // …the old one does not…
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      "don't match",
    );

    // …and yesterday's link is the normal case, not a crash.
    const reused = await page.goto(link);
    expect(reused?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/forgot-password\?error=link$/);
    await expect(page.getByRole("status").filter({ hasText: /expired or was already used/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  test("PWR-3: a malformed link and a bare visit to the reset page both recover", async ({ page }) => {
    const malformed = await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery");
    expect(malformed?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/forgot-password\?error=link$/);

    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=session$/);
    await expect(page.getByRole("status").filter({ hasText: /didn.t work or has expired/ })).toBeVisible();
  });

  test("PWR-4: the request form is accessible at every width, and announces its states", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await expectNoAxeViolations(page);
    await expectNoOverflow(page);

    await page.getByLabel("Email").fill(uniqueEmail("a11y"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    // The confirmation is a live region, not just a visual change.
    await expect(
      page.getByRole("status").filter({ hasText: /a link to choose a new password/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
