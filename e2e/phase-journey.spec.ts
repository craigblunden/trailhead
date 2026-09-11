import { join } from "node:path";

import { SIGNED_OUT, expect, newAccount, signIn, signOut, signUpAndVerify, test, waitForActionAnswer } from "./fixtures";

/**
 * Ticket 20: one journey proves the phase. A stranger signs up and verifies, signs in, adds a job,
 * moves it on, finds the move still there after a reload, uploads a resume, writes a cover letter
 * from it, signs out — and the board sends them to sign-in.
 *
 * The letter comes from the fake Anthropic API Playwright starts (`tests/fakes/anthropic-server.mjs`);
 * everything else is the real application against the local Supabase stack.
 */
test.use({ storageState: SIGNED_OUT });

const POSTING =
  "Harvest & Co is a food-tech company hiring a Lead Product Designer to build out the merchant experience: onboarding, menus, payouts, and the tools merchants use every day. You will lead a team of three and partner with engineering and research.";

test("PHASE-1: sign up → verify → sign in → add → move → reload → upload → write → sign out", async ({ page }) => {
  test.setTimeout(180_000);

  // Sign up and verify through the real mail, then sign out and back in with the password.
  const account = await signUpAndVerify(page, newAccount("journey"));
  await expect(page.getByRole("heading", { name: "No roles on the board yet" })).toBeVisible();
  await signOut(page);
  await signIn(page, account);

  // Add a job.
  await page.getByRole("button", { name: /add job/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company").fill("Harvest & Co");
  await dialog.getByLabel("Role title").fill("Lead Product Designer");
  await dialog.getByLabel("Job description").fill(POSTING);
  await dialog.getByRole("button", { name: "Add to board" }).click();
  const card = page.getByRole("region", { name: "Interested" }).getByRole("link", { name: "Lead Product Designer" });
  await expect(card).not.toHaveAttribute("href", /optimistic/);
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: "Lead Product Designer" })).toBeVisible();

  // Move it on, and find the move still there after a reload.
  const stageSaved = waitForActionAnswer(page, '"interviewing"');
  await page.getByRole("combobox", { name: "Application stage" }).click();
  await page.getByRole("option", { name: "Interviewing" }).click();
  await stageSaved;
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Application stage" })).toHaveText("Interviewing");
  await expect(page.getByRole("region", { name: "Activity" }).getByText("Moved to Interviewing")).toBeVisible();

  // Upload a resume from the job's application kit; it lands attached, and the upload is announced.
  const kit = page.getByRole("region", { name: "Application kit" });
  await kit
    .getByRole("region", { name: "Upload another" })
    .getByLabel("Choose a file to upload")
    .setInputFiles(join(process.cwd(), "tests", "fixtures", "documents", "resume.pdf"));
  await expect(kit.getByRole("status").filter({ hasText: "resume.pdf is ready." })).toBeVisible();
  await expect(kit.getByRole("group", { name: "Resume" }).getByText("On 1 job")).toBeVisible();

  // Write a cover letter from it. The wait is announced; the letter arrives; a letter is counted.
  const letterCard = page.getByRole("region", { name: "Cover letter" });
  await letterCard.getByRole("button", { name: "Write cover letter" }).click();
  await expect(letterCard.getByRole("status").filter({ hasText: "Writing your cover letter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your cover letter" })).toContainText("Dear Hiring Team,");
  await expect(page.getByRole("region", { name: "Your cover letter" })).toContainText("Harvest & Co");
  await expect(letterCard.getByText("4 of 5 left this week")).toBeVisible();

  // Leave nothing in storage, then sign out; the board is no longer reachable.
  await page.goto("/documents");
  await page.getByRole("button", { name: "Delete resume.pdf" }).click();
  await page.getByRole("dialog", { name: "Delete resume.pdf?" }).getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByText(/Nothing on file yet/)).toBeVisible();

  await signOut(page);
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
