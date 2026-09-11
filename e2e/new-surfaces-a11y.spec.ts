import { join } from "node:path";

import { expectAccessible, tabTo } from "./checks";
import { SIGNED_OUT, createJob, expect, newAccount, signUpAndVerify, test } from "./fixtures";

/**
 * Ticket 20: the surfaces added since Phase 1 meet the bar Phase 1 set — zero axe violations at the
 * four WCAG rule sets, no overflow at the four widths, focus that goes into a dialog and comes back
 * to what opened it, and states announced rather than only shown. Routes with a static URL are also
 * swept by a11y.spec.ts and responsive.spec.ts; these are the states a URL cannot reach.
 */

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

test.describe("keyboard only", () => {
  test("A11Y-4: /contacts — add a contact, open it, and delete it without a pointer", async ({ page }) => {
    const name = `Keyboard Kim ${Math.random().toString(36).slice(2, 6)}`;
    await page.goto("/contacts");
    await expect(page.getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();

    await tabTo(page, page.getByRole("button", { name: "Add contact" }).first());
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add a contact" });
    await expect(dialog.getByLabel("Name")).toBeFocused();
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");

    // Saving opens the contact's own page.
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    const remove = page.getByRole("button", { name: "Delete contact" });
    await tabTo(page, remove, 120);
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();
    await expect(remove).toBeFocused();

    await page.keyboard.press("Enter");
    await tabTo(page, confirm.getByRole("button", { name: "Delete contact" }), 6);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  });

  test.describe("with a fresh account", () => {
    // Documents count against a per-account cap, so this walk owns its account.
    test.use({ storageState: SIGNED_OUT });

    test("A11Y-4: /documents — choose the kind, upload, download, and delete without a pointer", async ({ page }) => {
      test.setTimeout(120_000);
      await signUpAndVerify(page);
      await page.goto("/documents");
      await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();

      // The kind is one radio group: one Tab stop, arrows to choose.
      const resume = page.getByRole("radio", { name: "Resume" });
      await tabTo(page, resume);
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Cover letter" })).toBeChecked();
      await page.keyboard.press("ArrowLeft");
      await expect(resume).toBeChecked();

      // The file input is drawn as its label, but it takes focus itself and Space opens the picker.
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Choose a file to upload")).toBeFocused();
      const chooser = page.waitForEvent("filechooser");
      await page.keyboard.press("Space");
      await (await chooser).setFiles(join(process.cwd(), "tests", "fixtures", "documents", "resume.pdf"));

      const download = page.getByRole("button", { name: "Download resume.pdf" });
      await expect(download).toBeVisible({ timeout: 30_000 });
      await tabTo(page, download);
      const saved = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      expect((await saved).suggestedFilename()).toBe("resume.pdf");

      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Delete resume.pdf" })).toBeFocused();
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("dialog", { name: "Delete resume.pdf?" });
      await expect(confirm).toBeVisible();
      await expectAccessible(page);
      await tabTo(page, confirm.getByRole("button", { name: "Delete document" }), 6);
      await page.keyboard.press("Enter");
      await expect(page.getByText(/Nothing on file yet/)).toBeVisible();
    });
  });
});
