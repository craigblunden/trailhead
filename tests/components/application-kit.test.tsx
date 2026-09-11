import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { JobDetail } from "@/components/job/job-detail";
import { ActionError } from "@/components/jobs-actions-client";
import type { Job } from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";
import { createFakeDocumentsClient, summary } from "../fakes/documents-client";
import { freezeClock, renderWithJobs, screen, waitFor, within } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/board/job",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const HARVEST = "harvest-lead-product-designer";
const harvest: Job = {
  ...SEED_JOBS.find((job) => job.id === HARVEST)!,
  resume: null,
  coverLetter: null,
};

const growth = summary({ id: "growth", fileName: "resume_growth_v2.pdf", jobs: [{ id: "x", company: "Fernwood", role: "PD" }] });
const staff = summary({ id: "staff", fileName: "resume_staff_v1.pdf" });
const letter = summary({ id: "letter", kind: "cover_letter", fileName: "letter_harvest.docx" });

function renderKit(documents = [growth, staff, letter], job: Job = harvest) {
  const client = createFakeDocumentsClient(documents, { jobs: [job] });
  const rendered = renderWithJobs(<JobDetail jobId={job.id} />, {
    initialJobs: [job],
    documentsClient: client,
  });
  return { client, ...rendered };
}

const kit = () => screen.getByRole("region", { name: "Application kit" });
const group = (name: "Resume" | "Cover letter") => within(kit()).getByRole("group", { name });

beforeEach(() => {
  freezeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the application kit (ticket 17)", () => {
  it("KIT-1: offers Nothing, then each document of that kind with how many jobs use it", async () => {
    renderKit();
    const resume = await within(kit()).findByRole("group", { name: "Resume" });

    expect(within(resume).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Nothing",
      "resume_growth_v2.pdfOn 1 job",
      "resume_staff_v1.pdfNot on any job yet",
    ]);
    expect(within(resume).getByRole("radio", { name: "Nothing" })).toBeChecked();
    expect(within(group("Cover letter")).getByRole("radio", { name: /letter_harvest\.docx/ })).not.toBeChecked();
    // Delete is not offered here.
    expect(within(kit()).queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("KIT-2: choosing a resume attaches it at once, and choosing a cover letter leaves the resume", async () => {
    const { client, user } = renderKit();
    await within(kit()).findByRole("group", { name: "Resume" });

    await user.click(within(group("Resume")).getByRole("radio", { name: /resume_staff_v1\.pdf/ }));
    expect(within(group("Resume")).getByRole("radio", { name: /resume_staff_v1\.pdf/ })).toBeChecked();
    await user.click(within(group("Cover letter")).getByRole("radio", { name: /letter_harvest\.docx/ }));

    await waitFor(() => expect(client.attach).toHaveBeenCalledTimes(2));
    expect(client.attach).toHaveBeenNthCalledWith(1, HARVEST, "resume", "staff");
    expect(client.attach).toHaveBeenNthCalledWith(2, HARVEST, "cover_letter", "letter");
    await waitFor(() =>
      expect(within(group("Resume")).getByRole("radio", { name: /resume_staff_v1\.pdf/ })).toBeChecked(),
    );
    expect(within(group("Cover letter")).getByRole("radio", { name: /letter_harvest\.docx/ })).toBeChecked();
  });

  it("KIT-3: Nothing removes the attached document from this job", async () => {
    const attached: Job = { ...harvest, resume: { id: "growth", fileName: "resume_growth_v2.pdf" } };
    const { client, user } = renderKit(undefined, attached);
    await within(kit()).findByRole("group", { name: "Resume" });
    expect(within(group("Resume")).getByRole("radio", { name: /resume_growth_v2\.pdf/ })).toBeChecked();

    await user.click(within(group("Resume")).getByRole("radio", { name: "Nothing" }));

    await waitFor(() => expect(client.attach).toHaveBeenCalledWith(HARVEST, "resume", null));
    expect(within(group("Resume")).getByRole("radio", { name: "Nothing" })).toBeChecked();
  });

  it("KIT-4: the radios are keyboard-operable", async () => {
    const { client, user } = renderKit();
    await within(kit()).findByRole("group", { name: "Resume" });
    within(group("Resume")).getByRole("radio", { name: "Nothing" }).focus();

    await user.keyboard("{ArrowDown}");

    await waitFor(() => expect(client.attach).toHaveBeenCalledWith(HARVEST, "resume", "growth"));
  });

  it("KIT-5: uploading is a secondary row, and a new upload lands attached to this job", async () => {
    const { client, user } = renderKit([growth]);
    const upload = await within(kit()).findByRole("region", { name: "Upload another" });

    await user.click(within(upload).getByRole("radio", { name: "Cover letter" }));
    await user.upload(
      within(upload).getByLabelText("Choose a file to upload"),
      new File([new Uint8Array(900)], "letter_new.pdf", { type: "application/pdf" }),
    );

    await waitFor(() => expect(client.attach).toHaveBeenCalledWith(HARVEST, "cover_letter", "document-1"));
    await waitFor(() =>
      expect(within(group("Cover letter")).getByRole("radio", { name: /letter_new\.pdf/ })).toBeChecked(),
    );
  });

  it("KIT-6: at the cap, the upload row says so and points to where documents are managed", async () => {
    renderKit();
    const upload = await within(kit()).findByRole("region", { name: "Upload another" });

    expect(upload).toHaveTextContent("All 3 slots used");
    expect(within(upload).getByRole("link", { name: "Manage documents" })).toHaveAttribute("href", "/documents");
    expect(within(upload).queryByLabelText("Choose a file to upload")).toBeNull();
  });

  it("KIT-7: a refused choice rolls back visibly and says why", async () => {
    const { client, user } = renderKit();
    client.attach.mockRejectedValueOnce(
      new ActionError("rejected", "That is a cover letter, so it cannot be sent as this job’s resume.", {}, "wrong-kind"),
    );
    await within(kit()).findByRole("group", { name: "Resume" });

    await user.click(within(group("Resume")).getByRole("radio", { name: /resume_staff_v1\.pdf/ }));

    expect(await within(kit()).findByRole("alert")).toHaveTextContent("cannot be sent as this job’s resume");
    expect(within(group("Resume")).getByRole("radio", { name: "Nothing" })).toBeChecked();
  });

  it("KIT-8: the kit has no structural axe violations", async () => {
    const { container } = renderKit();
    await within(kit()).findByRole("group", { name: "Resume" });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
