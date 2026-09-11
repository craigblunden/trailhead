import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, createJob, expect, signUpAndVerify, test } from "./fixtures";

/**
 * Ticket 18 (and 19's failure paths) end to end, against the fake Anthropic API Playwright starts
 * (`tests/fakes/anthropic-server.mjs`). The job description's markers choose what the fake returns;
 * everything on the app's side — the route, the quota, the card — is the real thing.
 */

const POSTING =
  "Fernwood is a subscription plant company. The Growth design team owns onboarding, pricing, and the referral loop, and works closely with lifecycle marketing and data science. ".repeat(
    3,
  );

async function saveDescription(page: Page, text: string) {
  const field = page.getByRole("textbox", { name: "Job description" });
  await field.fill(text);
  await field.blur();
  // The draft saves on blur; confirm the server holds it before generating from it. The server
  // trims free text, so that is what it holds.
  await expect
    .poll(async () => {
      await page.reload();
      return page.getByRole("textbox", { name: "Job description" }).inputValue();
    })
    .toBe(text.trim());
}

/** A job with a description and an attached resume, ready to write from. */
async function jobReadyToWrite(page: Page, description: string) {
  const job = await createJob(page, { company: "Fernwood" });
  await saveDescription(page, description);
  const kit = page.getByRole("region", { name: "Application kit" });
  await kit
    .getByRole("region", { name: "Upload another" })
    .getByLabel("Choose a file to upload")
    .setInputFiles(join(process.cwd(), "tests", "fixtures", "documents", "resume.pdf"));
  await expect(kit.getByRole("group", { name: "Resume" }).getByText("On 1 job")).toBeVisible();
  return job;
}

const card = (page: Page) => page.getByRole("region", { name: "Cover letter" });

test.describe("ticket 18: generate a cover letter", () => {
  // The quota is per account, so each journey owns a fresh one.
  test.use({ storageState: SIGNED_OUT });

  // Each journey uploads a resume; take it back out of storage so runs leave no files behind.
  test.afterEach(async ({ page }) => {
    await page.goto("/documents");
    const remove = page.getByRole("button", { name: /^Delete / });
    while ((await remove.count()) > 0) {
      await remove.first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete document" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  });

  test("a long generation does not block editing notes or changing the stage in another tab; then copy it", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await signUpAndVerify(page);
    const job = await jobReadyToWrite(page, `${POSTING} [[slow]]`);
    await expect(card(page).getByText("5 of 5 left this week")).toBeVisible();

    await card(page).getByRole("button", { name: "Write cover letter" }).click();
    const writing = card(page).getByRole("status").filter({ hasText: "Writing your cover letter" });
    await expect(writing).toBeVisible();

    // On this same page, while the letter is being written. Server Actions from one page run one at a
    // time, so if generation were an action this save would wait for the letter. Its answer must
    // arrive while the letter is still being written.
    const samePageSave = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().headers()["next-action"]) &&
        (response.request().postData() ?? "").includes("Prep the growth case study."),
    );
    await page.getByRole("textbox", { name: "Notes" }).fill("Prep the growth case study.");
    await page.getByRole("textbox", { name: "Notes" }).blur();
    await samePageSave;
    await expect(writing).toBeVisible();

    // Another tab, while the letter is still being written.
    const other = await context.newPage();
    await other.goto(job.href);
    // The screen updates optimistically, so the proof is the server's answer to each write. Other
    // actions run too (the job list refetches when the tab gains focus), so each write is picked out
    // by what it sends.
    const answered = (marker: string) =>
      other.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          Boolean(response.request().headers()["next-action"]) &&
          (response.request().postData() ?? "").includes(marker),
      );
    const notes = other.getByRole("textbox", { name: "Notes" });
    const notesSaved = answered("Asked about the size of the growth team.");
    await notes.fill("Asked about the size of the growth team.");
    await notes.blur();
    await notesSaved;
    const stageSaved = answered('"applied"');
    await other.getByRole("combobox", { name: "Application stage" }).click();
    await other.getByRole("option", { name: "Applied" }).click();
    await stageSaved;

    // Both writes committed — proven by a fresh read — while the letter is still being written.
    await other.reload();
    await expect(other.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Asked about the size of the growth team.",
    );
    await expect(other.getByRole("combobox", { name: "Application stage" })).toHaveText("Applied");
    await expect(writing).toBeVisible();

    // Then the letter.
    const letter = page.getByRole("region", { name: "Your cover letter" });
    await expect(letter).toContainText("Dear Hiring Team,", { timeout: 15_000 });
    await expect(letter).toContainText("at Fernwood");
    await expect(card(page).getByText("4 of 5 left this week")).toBeVisible();

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await card(page).getByRole("button", { name: "Copy letter" }).click();
    await expect(card(page).getByText("Copied to your clipboard.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Dear Hiring Team,");

    // The whole job page, with a written letter and its copy status on it.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test("ticket 19: a refusal and a timeout are explained and use no letter; at the quota the card says why and when", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signUpAndVerify(page);
    await jobReadyToWrite(page, `${POSTING} [[refuse]]`);
    const write = card(page).getByRole("button", { name: /Write cover letter|Write another/ });

    await write.click();
    const alert = card(page).getByRole("alert");
    await expect(alert).toContainText("Claude declined to write a letter");
    await expect(alert).toContainText("This didn’t use one of your letters.");
    await expect(page.getByRole("region", { name: "Your cover letter" })).toHaveCount(0);
    await expect(card(page).getByText("5 of 5 left this week")).toBeVisible();

    await saveDescription(page, `${POSTING} [[overload]]`);
    await card(page).getByRole("button", { name: "Write cover letter" }).click();
    await expect(card(page).getByRole("alert")).toContainText("The writing service had a problem");

    await saveDescription(page, `${POSTING} [[hang]]`);
    await card(page).getByRole("button", { name: "Write cover letter" }).click();
    await expect(card(page).getByRole("alert")).toContainText("Writing took longer than it should", {
      timeout: 20_000,
    });
    await expect(card(page).getByText("5 of 5 left this week")).toBeVisible();

    // Five real letters, then the designed at-quota state — not an error.
    await saveDescription(page, POSTING);
    for (let left = 4; left >= 0; left -= 1) {
      await card(page).getByRole("button", { name: /Write cover letter|Write another/ }).click();
      await expect(card(page).getByText(`${left} of 5 left this week`)).toBeVisible({ timeout: 15_000 });
    }
    await expect(card(page).getByText(/You’ve used all 5 letters this week/)).toContainText(
      "your next 5 arrive Monday",
    );
    await expect(card(page).getByRole("button", { name: "Write another" })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Your cover letter" })).toContainText("Dear Hiring Team,");
    await expect(card(page).getByRole("alert")).toHaveCount(0);
  });
});
