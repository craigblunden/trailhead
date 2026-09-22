import { join } from "node:path";

import type { Page } from "@playwright/test";

import { SIGNED_OUT, createJob, expect, signUpAndVerify, test, waitForActionAnswer } from "./fixtures";

/**
 * A Footing end to end (footing tickets 03, 04, 05), against the fake TypeSafe API Playwright starts
 * (`tests/fakes/typesafe-server.mjs`). The job description's markers choose what the fake returns;
 * everything on the app's side — the route, the readiness guard, the insert, the staleness stamp, the
 * card — is the real thing.
 *
 * Each journey owns a fresh account, and gives its uploads back afterwards: Documents count against a
 * per-account cap, and a Footing needs up to two of them, so sharing the worker's account would spend
 * every slot the other specs are relying on.
 */

test.use({ storageState: SIGNED_OUT });

test.afterEach(async ({ page }) => {
  await page.goto("/documents");
  const remove = page.getByRole("button", { name: /^Delete / });
  while ((await remove.count()) > 0) {
    await remove.first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete document" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

const POSTING =
  "Fernwood is a subscription plant company. The Growth design team owns onboarding, pricing, and the referral loop, and works closely with lifecycle marketing and data science. ".repeat(
    3,
  );

const card = (page: Page) => page.getByRole("region", { name: "Your footing" });
const kit = (page: Page) => page.getByRole("region", { name: "Application kit" });
const scoreButton = (page: Page) => card(page).getByRole("button", { name: /footing|Score/ });

/** The job description's field, which shows as an excerpt with an Edit button once saved. */
async function descriptionField(page: Page) {
  const field = page.getByRole("textbox", { name: "Job description" });
  const edit = page.getByRole("region", { name: "Job description" }).getByRole("button", { name: "Edit" });
  await expect(field.or(edit)).toBeVisible();
  if (await edit.isVisible()) await edit.click();
  return field;
}

async function saveDescription(page: Page, text: string) {
  await (await descriptionField(page)).fill(text);
  // The screen updates optimistically, so the server's own answer — not what is drawn — is the proof
  // the write landed. Reloading before it has would read the Job mid-save.
  const saved = waitForActionAnswer(page, "description");
  await page.getByRole("button", { name: "Save description" }).click();
  await saved;
  await page.reload();
  await expect(await descriptionField(page)).toHaveValue(text.trim());
}

const FIXTURE = join(process.cwd(), "tests", "fixtures", "documents", "resume.pdf");

/** Uploads the one readable fixture as `kind`, which lands it attached to the job on screen. */
async function attach(page: Page, kind: "Resume" | "Cover letter") {
  const upload = kit(page).getByRole("region", { name: "Upload another" });
  await upload.getByRole("radio", { name: kind, exact: true }).check();
  await upload.getByLabel("Choose a file to upload").setInputFiles(FIXTURE);
  await expect(kit(page).getByRole("group", { name: kind }).getByText("On 1 job")).toBeVisible();
}

/**
 * A job with a posting and a resume: the least a Footing can be scored from. The cover letter is
 * separate, because the Letter dimension exists only when there is a letter to read.
 */
async function jobReadyToScore(page: Page, description = POSTING) {
  await signUpAndVerify(page);
  const job = await createJob(page, { company: "Fernwood", description });
  await attach(page, "Resume");
  return job;
}

/** The band words on show, in the order the card lists them. */
async function bands(page: Page) {
  return card(page).getByRole("img").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
}

test("FOOT-E1: scores a job on request — five bands — and never shows a number", async ({ page }) => {
  test.setTimeout(120_000);
  await jobReadyToScore(page);
  await attach(page, "Cover letter");

  await expect(scoreButton(page)).toHaveText(/Check my footing/);
  await scoreButton(page).click();

  // The overall, and the four that make it up.
  await expect(card(page).getByRole("img", { name: /^Overall footing:/ })).toBeVisible();
  for (const dimension of ["Skills", "Experience", "Domain", "Proof of work"]) {
    await expect(card(page).getByRole("img", { name: new RegExp(`^${dimension}:`) })).toBeVisible();
  }
  // The fifth sits beside the letter it read, and never with the four.
  await expect(kit(page).getByRole("img", { name: /^Letter:/ })).toBeVisible();
  await expect(card(page).getByRole("img", { name: /^Letter:/ })).toHaveCount(0);

  const text = (await card(page).textContent()) ?? "";
  expect(text).not.toMatch(/\d+\s*%/);
  expect(await card(page).locator("progress, [role='progressbar'], meter").count()).toBe(0);

  // It survives a reload: a Footing is kept, not recomputed.
  await page.reload();
  await expect(card(page).getByRole("img", { name: /^Overall footing:/ })).toBeVisible();
});

test("FOOT-E2: editing the description makes it stale without changing it, and scoring again moves the bands", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await jobReadyToScore(page);
  await scoreButton(page).click();
  await expect(card(page).getByRole("img", { name: /^Overall footing:/ })).toBeVisible();
  const before = await bands(page);

  // `[[fstrong]]` tells the fake to answer at the top of every rubric, so the re-score is visible.
  await saveDescription(page, `${POSTING} [[fstrong]]`);

  await expect(card(page).getByText(/The job description has changed since this ran/)).toBeVisible();
  // Shown, not hidden, and not silently recomputed: the same bands are still there.
  expect(await bands(page)).toEqual(before);
  await expect(scoreButton(page)).toHaveText(/Score it again/);

  await scoreButton(page).click();
  await expect(card(page).getByRole("img", { name: "Overall footing: strong" })).toBeVisible();
  await expect(card(page).getByText(/changed since this ran/)).toBeHidden();

  // The one sentence the history exists for, and the earlier reading kept beneath it.
  await expect(card(page).getByText(/than last time on this one|About where it was last time/)).toBeVisible();
  const earlier = card(page).getByRole("heading", { name: "Earlier readings" });
  await expect(earlier).toBeVisible();
  await expect(card(page).getByRole("list").getByRole("listitem")).toHaveCount(1);
  // The earlier reading keeps the bands it recorded, so a rewritten resume can be read against them.
  for (const dimension of ["Skills", "Experience", "Domain", "Proof of work"]) {
    await expect(card(page).getByRole("list").getByRole("img", { name: new RegExp(`^${dimension} on `) })).toBeVisible();
  }
});

test("FOOT-E3: the control is refused, in the readiness wording, until the job has both", async ({ page }) => {
  test.setTimeout(120_000);
  await signUpAndVerify(page);
  await createJob(page, { company: "Fernwood" });

  // No resume and no posting: the resume is the first thing missing, and the first thing said.
  await expect(scoreButton(page)).toBeDisabled();
  await expect(card(page).getByText("Needs a resume")).toBeVisible();

  await attach(page, "Resume");

  await expect(card(page).getByText("Needs the posting")).toBeVisible();
  await expect(scoreButton(page)).toBeDisabled();

  await saveDescription(page, POSTING);
  await expect(scoreButton(page)).toBeEnabled();
});

test("FOOT-E4: a provider failure says so and stores nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await jobReadyToScore(page, `${POSTING} [[foverload]]`);

  await scoreButton(page).click();

  await expect(card(page).getByRole("alert")).toContainText(/scoring service had a problem/);
  // Their trouble, not the Tenant's: nothing here claims they have scored too much today.
  await expect(card(page).getByRole("alert")).not.toContainText(/you/i);
  await expect(scoreButton(page)).toBeEnabled();

  await page.reload();
  // Nothing was stored, so the card is back to inviting the first one.
  await expect(scoreButton(page)).toHaveText(/Check my footing/);
});

test("FOOT-E5: nothing about a Footing reaches the board", async ({ page }) => {
  test.setTimeout(120_000);
  const job = await jobReadyToScore(page);
  await scoreButton(page).click();
  await expect(card(page).getByRole("img", { name: /^Overall footing:/ })).toBeVisible();

  await page.goto("/board");
  const roleName = job.role;
  const cardOnBoard = page.getByRole("link", { name: roleName, exact: true });
  await expect(cardOnBoard).toBeVisible();
  for (const band of ["Strong", "Solid", "Developing", "Not there yet"]) {
    await expect(page.getByRole("main").getByText(band, { exact: true })).toHaveCount(0);
  }
});
