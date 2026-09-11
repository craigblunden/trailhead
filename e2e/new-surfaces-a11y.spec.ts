import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, createJob, expect, newAccount, test } from "./fixtures";
import { BREAKPOINTS } from "./routes";

/**
 * Ticket 20: the surfaces added since Phase 1 meet the bar Phase 1 set — zero axe violations at the
 * four WCAG rule sets, no overflow at the four widths, focus that goes into a dialog and comes back
 * to what opened it, and states announced rather than only shown. Routes with a static URL are also
 * swept by a11y.spec.ts and responsive.spec.ts; these are the states a URL cannot reach.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectAccessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  for (const width of BREAKPOINTS) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("A11Y-1: the verification screen after sign-up is accessible and announced", async ({ page }) => {
    const account = newAccount("a11y-verify");
    await page.goto("/signup");
    await page.getByLabel("Full name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    // Arriving here is announced, not only drawn.
    await expect(page.getByRole("main").getByRole("status").first()).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("signed in", () => {
  test("A11Y-2: the add-contact dialog takes focus and returns it to the button that opened it", async ({ page }) => {
    await page.goto("/contacts");
    const trigger = page.getByRole("main").getByRole("button", { name: "Add contact" }).or(
      page.getByRole("banner").getByRole("button", { name: "Add contact" }),
    );
    await trigger.first().click();
    const dialog = page.getByRole("dialog", { name: "Add a contact" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger.first()).toBeFocused();
  });

  test("A11Y-2: the job page's link-contact dialog returns focus, and the page stays operable from the keyboard", async ({ page }) => {
    await createJob(page);
    const add = page.getByRole("region", { name: "Contacts" }).getByRole("button", { name: "Add contact" });
    await add.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add a contact" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Search your contacts")).toBeFocused();
    await expectAccessible(page);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
  });

  test("A11Y-1: the documents page's empty state and upload control, and the job page's kit, are accessible", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    await expect(page.getByLabel("Choose a file to upload")).toBeAttached();
    await expectAccessible(page);

    await createJob(page);
    await expect(page.getByRole("region", { name: "Application kit" }).getByRole("group", { name: "Resume" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cover letter" }).getByText(/left this week/)).toBeVisible();
    await expectAccessible(page);
  });
});
