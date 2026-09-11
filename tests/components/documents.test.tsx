import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { DocumentsView } from "@/components/documents/documents-view";
import { ActionError } from "@/components/action-client";
import { UPLOAD_REFUSALS } from "@/lib/documents";
import type { Job } from "@/lib/jobs";
import { createTrail, summary } from "../fakes/trail";
import { SEED_JOBS } from "../fixtures/jobs";
import { freezeClock, renderWithJobs, screen, userEvent, waitFor, within } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const pdf = (name = "resume_principal.pdf", bytes = 2048) =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

/** A seed Job sending the default `summary()` Document as its resume. */
const sending = (id: string): Job => ({
  ...SEED_JOBS.find((job) => job.id === id)!,
  resume: { id: "doc-growth", fileName: "resume_growth_v2.pdf" },
  contacts: [],
});

beforeEach(() => {
  freezeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the documents page (tickets 15, 16)", () => {
  it("DOC-1: lists each document with its kind, size, date, and how many jobs use it", async () => {
    const trail = createTrail({
      jobs: [sending("fernwood-product-designer-growth"), sending("harvest-lead-product-designer")],
      documents: [
        summary(),
        summary({ id: "doc-letter", kind: "cover_letter", fileName: "letter.docx", sizeBytes: 900 }),
      ],
    });
    renderWithJobs(<DocumentsView />, { trail });

    const growth = (await screen.findByText("resume_growth_v2.pdf")).closest("li")!;
    expect(growth).toHaveTextContent("Resume · 180 KB · Uploaded Jul 11");
    expect(growth).toHaveTextContent("On 2 jobs");
    const letter = screen.getByText("letter.docx").closest("li")!;
    expect(letter).toHaveTextContent("Cover letter · 900 B");
    expect(letter).toHaveTextContent("Not attached to any job");
  });

  it("DOC-2: an upload announces each stage and lands in the list as the kind chosen", async () => {
    const trail = createTrail();
    const { user } = renderWithJobs(<DocumentsView />, { trail });

    await user.click(await screen.findByRole("radio", { name: "Cover letter" }));
    await user.upload(screen.getByLabelText("Choose a file to upload"), pdf("letter_fernwood.pdf"));

    expect(await screen.findByText("letter_fernwood.pdf is ready.")).toBeInTheDocument();
    expect(trail.documents.upload).toHaveBeenCalledWith(expect.any(File), "cover_letter", expect.any(Function));
    await waitFor(() => expect(screen.getByText("letter_fernwood.pdf").closest("li")).toBeInTheDocument());
  });

  it("DOC-3: an oversize or disallowed file is refused before anything is sent, saying what to do", async () => {
    const trail = createTrail();
    const { user } = renderWithJobs(<DocumentsView />, { trail });
    const input = await screen.findByLabelText("Choose a file to upload");

    await user.upload(input, pdf("huge.pdf", 5 * 1024 * 1024 + 1));
    expect(await screen.findByRole("alert")).toHaveTextContent(UPLOAD_REFUSALS["too-large"]);

    // `accept` would stop a real picker; a drag or a forced pick still meets the check.
    const forced = userEvent.setup({ applyAccept: false });
    await forced.upload(input, new File(["x"], "headshot.png", { type: "image/png" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(UPLOAD_REFUSALS["unsupported-type"]),
    );
    expect(trail.documents.upload).not.toHaveBeenCalled();
  });

  it("DOC-4: a refusal from the server is shown as written — e.g. a scan with no text", async () => {
    const trail = createTrail();
    trail.documents.upload.mockRejectedValueOnce(
      new ActionError("rejected", UPLOAD_REFUSALS["no-text-layer"], {}, "no-text-layer"),
    );
    const { user } = renderWithJobs(<DocumentsView />, { trail });

    await user.upload(await screen.findByLabelText("Choose a file to upload"), pdf("scan.pdf"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("scan.pdf:");
    expect(alert).toHaveTextContent(/no text in it/);
  });

  it("DOC-5: the cap is expressed before it is reached, and at the cap no upload can be attempted", async () => {
    const two = [summary({ id: "a" }), summary({ id: "b", fileName: "b.pdf" })];
    const { unmount } = renderWithJobs(<DocumentsView />, { trail: createTrail({ documents: two }) });
    expect(await screen.findByText(/Room for 1 more/)).toBeInTheDocument();
    unmount();

    renderWithJobs(<DocumentsView />, {
      trail: createTrail({ documents: [...two, summary({ id: "c", fileName: "c.pdf" })] }),
    });
    expect(await screen.findByText(/All 3 slots used/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a file to upload")).toBeNull();
  });

  it("DOC-6: deleting asks first, names the jobs that use it, then removes it from the list", async () => {
    const trail = createTrail({ jobs: [sending("fernwood-product-designer-growth")], documents: [summary()] });
    const { user } = renderWithJobs(<DocumentsView />, { trail });

    await user.click(await screen.findByRole("button", { name: "Delete resume_growth_v2.pdf" }));
    const confirm = screen.getByRole("dialog", { name: "Delete resume_growth_v2.pdf?" });
    expect(confirm).toHaveTextContent("attached to 1 job");
    expect(within(confirm).getByText("Product Designer, Growth · Fernwood")).toBeInTheDocument();
    expect(trail.documents.remove).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete document" }));

    await waitFor(() => expect(screen.queryByText("resume_growth_v2.pdf")).toBeNull());
    expect(trail.documents.remove).toHaveBeenCalledWith("doc-growth");
  });

  it("DOC-7: download mints a link for this view and follows it", async () => {
    const trail = createTrail({ documents: [summary()] });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { user } = renderWithJobs(<DocumentsView />, { trail });

    await user.click(await screen.findByRole("button", { name: "Download resume_growth_v2.pdf" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://storage.example/signed/doc-growth?token=t"));
    vi.unstubAllGlobals();
  });

  it("DOC-8: the page and its delete confirmation have no structural axe violations", async () => {
    const trail = createTrail({ documents: [summary()] });
    const { user, container } = renderWithJobs(<DocumentsView />, { trail });
    await screen.findByText("resume_growth_v2.pdf");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Delete resume_growth_v2.pdf" }));
    expect(await axe(document.body, AXE_OPTIONS)).toHaveNoViolations();
  });
});
