import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { JobDetail } from "@/components/job/job-detail";
import { SCORE_BAND_LABEL } from "@/lib/interview";
import type { Footing, FootingDimension, FootingPanel, FootingResponse } from "@/lib/footing";
import type { Job } from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, waitFor, within } from "../test-utils";

/**
 * The Footing on the job page (footing tickets 04, 05).
 *
 * What is under test is the three rules the feature rests on: no number is ever rendered, the Letter
 * dimension is never with the four, and nothing is ever scored without the Tenant asking.
 */

const client = vi.hoisted(() => ({ panel: vi.fn(), score: vi.fn() }));

vi.mock("@/components/job/footing-client", () => ({ footingClient: client }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/board/fernwood-product-designer-growth",
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const base = SEED_JOBS.find((candidate) => candidate.id === "fernwood-product-designer-growth")!;
const job: Job = {
  ...base,
  description: "Fernwood is a subscription plant company. ".repeat(12),
  resume: { id: "doc-resume", fileName: "resume.pdf" },
  coverLetter: { id: "doc-letter", fileName: "letter.pdf" },
};

const footing = (
  dimensions: Partial<Record<FootingDimension, number>>,
  { id = "f1", confidence = 0.8, changed = [] as Footing["changed"], scoredAt = "2026-09-22T10:00:00.000Z" } = {},
): Footing => ({
  id,
  jobId: job.id,
  scoredAt,
  changed,
  dimensions: Object.entries(dimensions).map(([dimension, score]) => ({
    dimension: dimension as FootingDimension,
    score: score!,
    confidence,
  })),
});

const ALL = { skills: 75, experience: 75, domain: 50, proof_of_work: 25, letter: 100 };

const panel = (overrides: Partial<FootingPanel> = {}): FootingPanel => ({
  available: true,
  newest: null,
  earlier: [],
  ...overrides,
});

const card = () => screen.getByRole("region", { name: "Your footing" });
const kit = () => screen.getByRole("region", { name: "Application kit" });
const scoreButton = () => within(card()).getByRole("button", { name: /footing|score/i });

function renderJob(initial: FootingPanel, jobOverrides: Partial<Job> = {}) {
  client.panel.mockResolvedValue(initial);
  const withOverrides = { ...job, ...jobOverrides };
  return renderWithJobs(<JobDetail jobId={withOverrides.id} />, {
    initialJobs: SEED_JOBS.map((candidate) => (candidate.id === job.id ? withOverrides : candidate)),
  });
}

beforeEach(() => {
  client.panel.mockReset();
  client.score.mockReset();
});

describe("footing ticket 04: what is shown", () => {
  it("FOOT-45: invites the first one when the Tenant has never scored this Job", async () => {
    renderJob(panel());
    await waitFor(() => expect(scoreButton()).toHaveAccessibleName("Check my footing"));
    expect(within(card()).queryByText(SCORE_BAND_LABEL.solid)).toBeNull();
  });

  it("FOOT-46: shows the overall band and the four dimensions, each with its own band", async () => {
    renderJob(panel({ newest: footing(ALL) }));
    await screen.findByRole("img", { name: "Overall footing: solid" });

    const region = within(card());
    expect(region.getByRole("img", { name: "Skills: solid" })).toBeInTheDocument();
    expect(region.getByRole("img", { name: "Experience: solid" })).toBeInTheDocument();
    expect(region.getByRole("img", { name: "Domain: developing" })).toBeInTheDocument();
    expect(region.getByRole("img", { name: "Proof of work: not there yet" })).toBeInTheDocument();
  });

  it("FOOT-47: never renders a number — no percentage, no score, no bar", async () => {
    renderJob(panel({ newest: footing(ALL) }));
    await screen.findByRole("img", { name: "Overall footing: solid" });

    const text = card().textContent ?? "";
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toContain("75");
    expect(text).not.toContain("100");
    expect(card().querySelector("progress, [role='progressbar'], meter")).toBeNull();
  });

  it("FOOT-48: the Letter dimension sits beside the letter, never with the four", async () => {
    renderJob(panel({ newest: footing(ALL) }));
    await screen.findByRole("img", { name: "Overall footing: solid" });

    expect(within(kit()).getByRole("img", { name: "Letter: strong" })).toBeInTheDocument();
    expect(within(card()).queryByRole("img", { name: /^Letter:/ })).toBeNull();
    // And it says why it is not in the overall, where someone would ask.
    expect(within(kit()).getByText(/isn’t part of your overall footing/i)).toBeInTheDocument();
  });

  it("FOOT-49: a dimension the provider was unsure of is marked, and a whole shaky reading is said once", async () => {
    const { unmount } = renderJob(
      panel({
        newest: {
          ...footing(ALL),
          dimensions: [
            { dimension: "skills", score: 75, confidence: 0.9 },
            { dimension: "experience", score: 75, confidence: 0.9 },
            { dimension: "domain", score: 50, confidence: 0.1 },
            { dimension: "proof_of_work", score: 25, confidence: 0.9 },
          ],
        },
      }),
    );
    await screen.findByRole("img", { name: "Domain: developing" });
    expect(within(card()).getAllByText("Not clear-cut")).toHaveLength(1);
    expect(within(card()).queryByText(/treat this reading as a rough one/i)).toBeNull();
    unmount();

    renderJob(panel({ newest: footing(ALL, { confidence: 0.1 }) }));
    await screen.findByText(/treat this reading as a rough one/i);
    // Said once above the breakdown, rather than five times inside it.
    expect(within(card()).queryByText("Not clear-cut")).toBeNull();
  });

  it("FOOT-50: a stale Footing is still shown, with a line saying what moved", async () => {
    renderJob(panel({ newest: footing(ALL, { changed: ["resume", "description"] }) }));

    expect(
      await within(card()).findByText(/Your resume and the job description have changed since this ran/),
    ).toBeInTheDocument();
    // Shown, not hidden: the bands are still there.
    expect(within(card()).getByRole("img", { name: "Overall footing: solid" })).toBeInTheDocument();
    await waitFor(() => expect(scoreButton()).toHaveAccessibleName("Score it again"));
  });
});

describe("footing ticket 04: the control", () => {
  it("FOOT-51: is disabled with the readiness wording when there is no resume or no posting", async () => {
    const { unmount } = renderJob(panel(), { resume: null });
    await waitFor(() => expect(scoreButton()).toBeDisabled());
    expect(within(card()).getByText("Needs a resume")).toBeInTheDocument();
    unmount();

    renderJob(panel(), { description: "  " });
    await waitFor(() => expect(scoreButton()).toBeDisabled());
    expect(within(card()).getByText("Needs the posting")).toBeInTheDocument();
  });

  it("FOOT-52: is absent entirely when the feature is unavailable on this deployment", async () => {
    renderJob(panel({ available: false }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Your footing" })).toBeNull());
  });

  it("FOOT-53: nothing is scored until the Tenant presses it, and the result lands without a refetch", async () => {
    const scored = footing({ ...ALL, skills: 100, experience: 100, domain: 100, proof_of_work: 100 }, { id: "f2" });
    client.score.mockResolvedValue({ ok: true, footing: scored, previous: null } satisfies FootingResponse);
    const { user } = renderJob(panel());
    await waitFor(() => expect(scoreButton()).toBeEnabled());
    expect(client.score).not.toHaveBeenCalled();

    await user.click(scoreButton());

    await waitFor(() => expect(client.score).toHaveBeenCalledWith(job.id));
    expect(await within(card()).findByRole("img", { name: "Overall footing: strong" })).toBeInTheDocument();
    expect(client.panel).toHaveBeenCalledTimes(1);
  });

  it("FOOT-54: a refused scoring says why, in the server's own words, and keeps the control live", async () => {
    client.score.mockResolvedValue({
      ok: false,
      error: "rate-limited",
      message: "You’ve scored a lot of jobs today. Try again tomorrow.",
    } satisfies FootingResponse);
    const { user } = renderJob(panel());
    await waitFor(() => expect(scoreButton()).toBeEnabled());

    await user.click(scoreButton());

    expect(await within(card()).findByRole("alert")).toHaveTextContent(/scored a lot of jobs today/);
    expect(scoreButton()).toBeEnabled();
  });
});

describe("footing ticket 05: what changed since last time", () => {
  it("FOOT-55: two Footings in different bands produce the sentence, and a single one produces none", async () => {
    const { unmount } = renderJob(panel({ newest: footing(ALL, { id: "new" }) }));
    await screen.findByRole("img", { name: "Overall footing: solid" });
    expect(within(card()).queryByText(/than last time/i)).toBeNull();
    unmount();

    renderJob(
      panel({
        newest: footing(ALL, { id: "new" }),
        earlier: [footing({ skills: 0, experience: 0, domain: 0, proof_of_work: 0 }, { id: "old" })],
      }),
    );
    expect(await within(card()).findByText("Stronger than last time on this one — solid now.")).toBeInTheDocument();
  });

  it("FOOT-56: two in the same band are not dressed up as an improvement", async () => {
    renderJob(
      panel({
        newest: footing({ skills: 65, experience: 65, domain: 65, proof_of_work: 65 }, { id: "new" }),
        earlier: [footing({ skills: 60, experience: 60, domain: 60, proof_of_work: 60 }, { id: "old" })],
      }),
    );
    expect(await within(card()).findByText("About where it was last time — still solid.")).toBeInTheDocument();
  });

  it("FOOT-57: the earlier ones are a short dated list, newest first, and never a chart", async () => {
    renderJob(
      panel({
        newest: footing(ALL, { id: "new" }),
        earlier: [
          footing({ skills: 100, experience: 100, domain: 100, proof_of_work: 100 }, {
            id: "old-1",
            scoredAt: "2026-09-20T10:00:00.000Z",
          }),
          footing({ skills: 0, experience: 0, domain: 0, proof_of_work: 0 }, {
            id: "old-2",
            scoredAt: "2026-09-18T10:00:00.000Z",
          }),
        ],
      }),
    );
    await screen.findByRole("img", { name: "Overall footing: solid" });
    const rows = within(within(card()).getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Each earlier reading: its date, its overall band, and the bands it recorded on the four.
    expect(rows[0].textContent).toBe(
      "September 20, 2026StrongSkillsStrongExperienceStrongDomainStrongProof of workStrong",
    );
    expect(rows[1].textContent).toBe(
      "September 18, 2026Not there yetSkillsNot there yetExperienceNot there yetDomainNot there yetProof of workNot there yet",
    );
    // …and nothing that reads as a chart or a number.
    expect(within(card()).getByRole("list").textContent).not.toMatch(/\d+\s*%/);
  });
});

describe("footing ticket 04: assistive technology", () => {
  it("FOOT-58: the job page with a Footing on it has no axe violations", async () => {
    const { container } = renderJob(
      panel({ newest: footing(ALL, { changed: ["resume"] }), earlier: [footing(ALL, { id: "old" })] }),
    );
    await screen.findByRole("img", { name: "Overall footing: solid" });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("FOOT-59: colour is never the only carrier — every band is also heard as a word", async () => {
    renderJob(panel({ newest: footing(ALL) }));
    await screen.findByRole("img", { name: "Overall footing: solid" });
    for (const band of within(card()).getAllByRole("img")) {
      expect(band).toHaveAccessibleName(/: (strong|solid|developing|not there yet)$/);
    }
  });
});
