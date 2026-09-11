import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";

import { SIGNED_OUT, expect, signUpAndVerify, test } from "./fixtures";
import { BREAKPOINTS } from "./routes";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
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

    await page.evaluate(() => document.fonts.ready);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    for (const width of BREAKPOINTS) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

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
});
