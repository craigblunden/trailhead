import type { Page } from "@playwright/test";

import { expectAccessible } from "./checks";
import { createJob, expect, test } from "./fixtures";

/** Adds a contact to the job page in hand through the search-first dialog, creating it. */
async function createContactFromJob(page: Page, name: string, kind = "Recruiter") {
  const card = page.getByRole("region", { name: "Contacts" });
  await card.getByRole("button", { name: "Add contact" }).click();
  const search = page.getByRole("dialog", { name: "Add a contact" });
  await search.getByLabel("Search your contacts").fill(name);
  await search.getByRole("button", { name: `Create “${name}”` }).click();
  const create = page.getByRole("dialog", { name: "Create a contact" });
  if (kind !== "Recruiter") {
    await create.getByRole("combobox", { name: "Kind" }).click();
    await page.getByRole("option", { name: kind }).click();
  }
  await create.getByRole("button", { name: "Create and add" }).click();
  await expect(create).toBeHidden();
  await expect(card.getByRole("link", { name, exact: true })).toBeVisible();
}

test.describe("ticket 14: contacts", () => {
  test("a contact is created from one job, linked to a second, edited, and deleted", async ({ page }) => {
    const suffix = Math.random().toString(36).slice(2, 6);
    const name = `Dana Whitfield ${suffix}`;

    const first = await createJob(page, { company: "Fernwood" });
    await createContactFromJob(page, name);

    // Linking from a second job finds the saved contact instead of creating another.
    const second = await createJob(page, { company: "Harvest & Co" });
    const card = page.getByRole("region", { name: "Contacts" });
    await card.getByRole("button", { name: "Add contact" }).click();
    const search = page.getByRole("dialog", { name: "Add a contact" });
    await search.getByLabel("Search your contacts").fill(suffix);
    await search.getByRole("button", { name: new RegExp(name) }).click();
    await expect(search).toBeHidden();
    await expect(card.getByRole("link", { name: /Also on 1 other job/ })).toBeVisible();

    // The contact's page answers "which roles has Dana sent me?"
    await card.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    const roles = page.getByRole("region", { name: `Roles with ${name}` });
    await expect(roles.getByRole("heading", { name: /Interested/ })).toBeVisible();
    await expect(roles.getByRole("link", { name: first.role })).toBeVisible();
    await expect(roles.getByRole("link", { name: second.role })).toBeVisible();

    // Changing the kind edits this contact; it does not create a second one.
    await page.getByRole("combobox", { name: "Kind" }).click();
    await page.getByRole("option", { name: "Hiring manager" }).click();
    await page.getByLabel("Agency").fill("Northstar Talent");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Hiring manager · Northstar Talent").first()).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(1);

    // Unlinking from the first job leaves the contact and its other link.
    await page.goto(first.href);
    await page
      .getByRole("region", { name: "Contacts" })
      .getByRole("button", { name: `Remove ${name} from this job` })
      .click();
    await expect(page.getByRole("region", { name: "Contacts" }).getByText(/No contacts saved/)).toBeVisible();
    await page.goto(second.href);
    await expect(page.getByRole("region", { name: "Contacts" }).getByRole("link", { name, exact: true })).toBeVisible();

    // Delete, from the contact's page, behind a confirm.
    await page.getByRole("region", { name: "Contacts" }).getByRole("link", { name, exact: true }).click();
    await page.getByRole("button", { name: "Delete contact" }).click();
    const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
    await expect(confirm).toContainText("removed from 1 job");
    await confirm.getByRole("button", { name: "Delete contact" }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await page.goto(second.href);
    await expect(page.getByRole("region", { name: "Contacts" }).getByText(/No contacts saved/)).toBeVisible();
  });

  test("the header links to Board and Contacts at md width and up", async ({ page }) => {
    await page.goto("/board");
    const nav = page.getByRole("navigation", { name: "Primary" });

    await page.setViewportSize({ width: 767, height: 900 });
    await expect(nav).toBeHidden();

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(nav.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Contacts" }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();
  });

  test("an unknown contact id explains itself", async ({ page }) => {
    const response = await page.goto("/contacts/not-a-real-contact");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "This contact isn’t in your contacts" })).toBeVisible();
  });

  test("A11Y-1 and RESP-1: the contacts surfaces have no axe violations and do not overflow", async ({ page }) => {
    const job = await createJob(page);
    await createContactFromJob(page, `Jess Liu ${Math.random().toString(36).slice(2, 6)}`, "Referrer");

    // The job page's card with its dialog open, at both steps: search, then create.
    await page.getByRole("region", { name: "Contacts" }).getByRole("button", { name: "Add contact" }).click();
    const search = page.getByRole("dialog", { name: "Add a contact" });
    await expect(search).toBeVisible();
    await expectAccessible(page);
    await search.getByLabel("Search your contacts").fill("Nobody Yet");
    await search.getByRole("button", { name: "Create “Nobody Yet”" }).click();
    await expect(page.getByRole("dialog", { name: "Create a contact" })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    const contactLink = page.getByRole("region", { name: "Contacts" }).getByRole("link").first();
    const contactHref = (await contactLink.getAttribute("href"))!;

    for (const path of ["/contacts", contactHref, job.href]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectAccessible(page);
    }

    // A contact's delete confirmation.
    await page.goto(contactHref);
    await page.getByRole("button", { name: "Delete contact" }).click();
    const confirm = page.getByRole("dialog", { name: /^Delete .+\?$/ });
    await expect(confirm).toBeVisible();
    await expectAccessible(page);
    await confirm.getByRole("button", { name: "Keep contact" }).click();
    await expect(confirm).toBeHidden();
  });
});
