import { join } from "node:path";

import type { Page, Request } from "@playwright/test";

import { expectAccessible } from "./checks";
import { SIGNED_OUT, createJob, expect, signUpAndVerify, test } from "./fixtures";

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", "documents", name);

async function uploadAs(page: Page, name: string, kind: "Resume" | "Cover letter" = "Resume") {
  await page.getByRole("radio", { name: kind }).check();
  await page.getByLabel("Choose a file to upload").setInputFiles(fixture(name));
}

test.describe("tickets 15 and 16: documents", () => {
  // Documents count against a per-account cap, so this journey owns a fresh account.
  test.use({ storageState: SIGNED_OUT });

  test("upload browser-direct, refuse a scan, reach the cap, download, and delete", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await signUpAndVerify(page);

    // Where writes went. Playwright does not expose a File/Blob body, so a Storage upload is known
    // by its signed-upload endpoint; an app request is suspect if it is multipart or large.
    const storagePuts: string[] = [];
    const appFileBodies: string[] = [];
    page.on("request", (request: Request) => {
      const url = request.url();
      if (url.includes("/storage/v1/object/upload/sign/") && request.method() === "PUT") {
        storagePuts.push(url);
      } else if (url.startsWith(baseURL!) && request.method() !== "GET") {
        const type = request.headers()["content-type"] ?? "";
        const bytes = request.postDataBuffer()?.length ?? 0;
        if (type.includes("multipart") || type.includes("octet-stream") || bytes >= 1024) {
          appFileBodies.push(`${request.method()} ${url} ${type} ${bytes}`);
        }
      }
    });

    await page.goto("/documents");
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    await expect(page.getByText(/Room for 3 more/)).toBeVisible();

    await uploadAs(page, "resume.pdf");
    await expect(page.getByRole("status").filter({ hasText: "resume.pdf is ready." })).toBeVisible();
    await uploadAs(page, "resume.docx", "Cover letter");
    await expect(page.getByRole("status").filter({ hasText: "resume.docx is ready." })).toBeVisible();

    const list = page.getByRole("region", { name: /On file/ });
    await expect(list.getByText("resume.pdf", { exact: true })).toBeVisible();
    await expect(list.getByText(/^Cover letter · /)).toBeVisible();
    await expect(page.getByText(/Room for 1 more/)).toBeVisible();

    // The bytes went from the browser to Storage. The app server never received a file body.
    expect(storagePuts.length).toBeGreaterThanOrEqual(2);
    expect(appFileBodies).toEqual([]);

    // A scan is refused while the user is still holding it, and nothing is kept.
    await uploadAs(page, "scan.pdf");
    // Scoped to main: Next's route announcer is also role="alert".
    await expect(page.getByRole("main").getByRole("alert")).toContainText("no text in it");
    await expect(list.getByText("scan.pdf", { exact: true })).toHaveCount(0);

    // A locked PDF and a PDF under a .docx name each get their own message, naming what to do.
    await uploadAs(page, "locked.pdf");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("password-protected");
    await uploadAs(page, "pdf-named-as.docx");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("the kind its name says");
    await expect(list.getByText(/locked\.pdf|pdf-named-as\.docx/)).toHaveCount(0);

    // The third slot is the last; after it the control is gone.
    await uploadAs(page, "long.pdf");
    // Scoped to main: Next's route announcer is also role="alert".
    await expect(page.getByRole("main").getByRole("alert")).toContainText("over 20 pages");
    await page.getByLabel("Choose a file to upload").setInputFiles({
      name: "resume_v3.pdf",
      mimeType: "application/pdf",
      buffer: await import("node:fs").then((fs) => fs.readFileSync(fixture("resume.pdf"))),
    });
    await expect(page.getByText(/All 3 slots used/)).toBeVisible();
    await expect(page.getByLabel("Choose a file to upload")).toHaveCount(0);

    // A download is a signed link minted for this view.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download resume.pdf" }).click();
    expect((await download).suggestedFilename()).toBe("resume.pdf");

    await expectAccessible(page);

    // Delete lives here, behind a confirm; each one frees a slot. Clean up all three.
    for (const name of ["resume_v3.pdf", "resume.docx", "resume.pdf"]) {
      await page.getByRole("button", { name: `Delete ${name}` }).click();
      const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
      await confirm.getByRole("button", { name: "Delete document" }).click();
      await expect(confirm).toBeHidden();
      await expect(list.getByText(name, { exact: true })).toHaveCount(0);
    }
    await page.reload();
    await expect(page.getByText(/Nothing on file yet/)).toBeVisible();
  });

  test("ticket 17: a job's application kit — upload lands attached, pick by keyboard, axe, no overflow", async ({ page }) => {
    test.setTimeout(120_000);
    await signUpAndVerify(page);
    const first = await createJob(page, { company: "Fernwood" });

    // Upload from the kit: it lands attached to the job in hand.
    const kit = page.getByRole("region", { name: "Application kit" });
    const upload = kit.getByRole("region", { name: "Upload another" });
    await upload.getByLabel("Choose a file to upload").setInputFiles(fixture("resume.pdf"));
    const resumeGroup = kit.getByRole("group", { name: "Resume" });
    await expect(resumeGroup.getByRole("radio", { name: /resume\.pdf/ })).toBeChecked();
    // The radio moves at once; the count changes only once the server has saved the choice. Wait
    // for that before leaving the page, or the navigation races the write.
    await expect(resumeGroup.getByText("On 1 job")).toBeVisible();

    // A second job reuses the same file without uploading it again, chosen from the keyboard.
    const second = await createJob(page, { company: "Harvest & Co" });
    await resumeGroup.getByRole("radio", { name: "Nothing" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(resumeGroup.getByRole("radio", { name: /resume\.pdf/ })).toBeChecked();
    await expect(resumeGroup.getByText("On 2 jobs")).toBeVisible();
    await page.reload();
    await expect(resumeGroup.getByRole("radio", { name: /resume\.pdf/ })).toBeChecked();
    await expect(resumeGroup.getByText("On 2 jobs")).toBeVisible();

    // Detaching from one job leaves the other.
    await resumeGroup.getByRole("radio", { name: "Nothing" }).check();
    await expect(resumeGroup.getByText("On 1 job")).toBeVisible();
    await page.goto(first.href);
    await expect(resumeGroup.getByRole("radio", { name: /resume\.pdf/ })).toBeChecked();

    await expectAccessible(page);
    void second;

    // Leave the account's storage empty.
    await page.goto("/documents");
    await page.getByRole("button", { name: "Delete resume.pdf" }).click();
    await page.getByRole("dialog", { name: "Delete resume.pdf?" }).getByRole("button", { name: "Delete document" }).click();
    await expect(page.getByText(/Nothing on file yet/)).toBeVisible();
  });
});
