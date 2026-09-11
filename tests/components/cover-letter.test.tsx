import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { CoverLetterCard } from "@/components/job/cover-letter";
import type { GenerationResponse } from "@/lib/generation";
import type { Job } from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, waitFor, within } from "../test-utils";

const client = vi.hoisted(() => ({
  status: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/components/job/cover-letter-client", () => ({ coverLetterClient: client }));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const long = "Fernwood is a subscription plant company. ".repeat(12);
const job: Job = {
  ...SEED_JOBS.find((candidate) => candidate.id === "fernwood-product-designer-growth")!,
  description: long,
};

const status = (remaining: number, available = true) => ({
  limit: 5,
  used: 5 - remaining,
  remaining,
  resetsOn: "2026-07-27",
  available,
});

const card = () => screen.getByRole("region", { name: "Cover letter" }) ?? screen.getByText("Cover letter");

beforeEach(() => {
  client.status.mockReset().mockResolvedValue(status(5));
  client.generate.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the cover letter card (tickets 13, 18, 19)", () => {
  it("GEN-U1: shows letters left before anything is pressed", async () => {
    client.status.mockResolvedValue(status(3));
    renderWithJobs(<CoverLetterCard job={job} />);

    expect(await screen.findByText("3 of 5 left this week")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write cover letter" })).toBeEnabled();
  });

  it("GEN-U2: announces the wait once, without a spinner alone, and keeps the page editable", async () => {
    let finish!: (response: GenerationResponse) => void;
    client.generate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);

    await user.click(await screen.findByRole("button", { name: "Write cover letter" }));

    const announcement = screen.getByRole("status");
    expect(announcement).toHaveTextContent("Writing your cover letter. This usually takes 10 to 25 seconds");
    expect(announcement).toHaveTextContent("you can keep editing this page");
    expect(screen.getByRole("button", { name: "Writing…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();

    finish({ ok: true, letter: "Dear Hiring Team,\n\nI'd love to help Fernwood grow.", quota: status(4) });
    const letter = await screen.findByRole("region", { name: "Your cover letter" });
    expect(letter).toHaveTextContent("I'd love to help Fernwood grow.");
    expect(screen.getByText("4 of 5 left this week")).toBeInTheDocument();
  });

  it("GEN-U3: copies the letter, and says the letter is not saved", async () => {
    client.generate.mockResolvedValue({ ok: true, letter: "Dear Hiring Team,", quota: status(4) });
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(await screen.findByRole("button", { name: "Write cover letter" }));
    await user.click(await screen.findByRole("button", { name: "Copy letter" }));

    expect(writeText).toHaveBeenCalledWith("Dear Hiring Team,");
    expect(await screen.findByText("Copied to your clipboard.")).toBeInTheDocument();
    expect(screen.getByText(/isn’t saved/)).toBeInTheDocument();
  });

  it("GEN-U4: a refusal is explained, not rendered as an empty letter, and says no letter was used", async () => {
    client.generate.mockResolvedValue({
      ok: false,
      error: "refused",
      message: "Claude declined to write a letter for this job.",
      quota: status(5),
      refunded: true,
    });
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);

    await user.click(await screen.findByRole("button", { name: "Write cover letter" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Claude declined");
    expect(alert).toHaveTextContent("This didn’t use one of your letters.");
    expect(screen.queryByRole("region", { name: "Your cover letter" })).toBeNull();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("GEN-U5: an error and a timeout each render their own message", async () => {
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);
    await screen.findByRole("button", { name: "Write cover letter" });

    client.generate.mockResolvedValueOnce({ ok: false, error: "failed", message: "The writing service had a problem.", quota: status(5) });
    await user.click(screen.getByRole("button", { name: "Write cover letter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The writing service had a problem.");

    client.generate.mockResolvedValueOnce({ ok: false, error: "timed-out", message: "Writing took longer than it should.", quota: status(5) });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Writing took longer than it should."));
  });

  it("GEN-U6: at the quota, the button is off and the card says why and when — not a generic error", async () => {
    client.status.mockResolvedValue(status(0));
    renderWithJobs(<CoverLetterCard job={job} />);

    expect(await screen.findByText(/You’ve used all 5 letters this week/)).toHaveTextContent(
      "Each one is written fresh by a paid AI model; your next 5 arrive Monday, Jul 27.",
    );
    expect(screen.getByRole("button", { name: "Write cover letter" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("GEN-U7: needs a resume and a description, warns about a short one, and says when generation is unavailable", async () => {
    const { unmount } = renderWithJobs(<CoverLetterCard job={{ ...job, resume: null }} />);
    expect(await screen.findByText(/Attach a resume in this job’s application kit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write cover letter" })).toBeDisabled();
    unmount();

    const short = renderWithJobs(<CoverLetterCard job={{ ...job, description: "Design things." }} />);
    expect(await screen.findByText(/Short descriptions make generic letters/)).toBeInTheDocument();
    short.unmount();

    // An empty description has nothing to write from: the button is off, and the card says why.
    const blank = renderWithJobs(<CoverLetterCard job={{ ...job, description: "   " }} />);
    expect(await screen.findByText(/Paste the job posting into this job’s description/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write cover letter" })).toBeDisabled();
    blank.unmount();

    client.status.mockResolvedValue(status(5, false));
    renderWithJobs(<CoverLetterCard job={job} />);
    expect(await screen.findByText(/aren’t available on this deployment/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write cover letter" })).toBeNull();
  });

  it("GEN-U9: says no letter was used only when the server says it gave the letter back", async () => {
    client.generate.mockResolvedValueOnce({
      ok: false,
      error: "failed",
      message: "Something went wrong on our side.",
      quota: status(4),
    });
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);

    await user.click(await screen.findByRole("button", { name: "Write cover letter" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on our side.");
    expect(alert).not.toHaveTextContent("didn’t use one of your letters");

    client.generate.mockResolvedValueOnce({
      ok: false,
      error: "failed",
      message: "The writing service had a problem.",
      quota: status(4),
      refunded: true,
    });
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("didn’t use one of your letters"),
    );
  });

  it("GEN-U10: the wait is announced by a live region that was already on the page", async () => {
    let finish!: (response: GenerationResponse) => void;
    client.generate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderWithJobs(<CoverLetterCard job={job} />);
    const button = await screen.findByRole("button", { name: "Write cover letter" });
    const live = screen.getByRole("status");
    expect(live).toBeEmptyDOMElement();

    await user.click(button);

    expect(live).toHaveTextContent("Writing your cover letter");
    finish({ ok: true, letter: "Dear Hiring Team,", quota: status(4) });
    await screen.findByRole("region", { name: "Your cover letter" });
  });

  it("GEN-U8: idle, writing, and written states have no structural axe violations", async () => {
    let finish!: (response: GenerationResponse) => void;
    client.generate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user, container } = renderWithJobs(<CoverLetterCard job={job} />);
    await screen.findByRole("button", { name: "Write cover letter" });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Write cover letter" }));
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    finish({ ok: true, letter: "Dear Hiring Team,", quota: status(4) });
    await screen.findByRole("region", { name: "Your cover letter" });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
    void card;
  });
});
