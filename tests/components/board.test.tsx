import { describe, expect, it } from "vitest";

import { BoardView } from "@/components/board/board-view";
import { STAGES, STAGE_META, pluralize, type Job } from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";
import { renderWithJobs, screen, within } from "../test-utils";

/** The column `<section>` for a stage, located by its visible heading. */
function column(stage: (typeof STAGES)[number]) {
  return screen.getByRole("region", { name: STAGE_META[stage].label });
}

describe("board columns", () => {
  it("BOARD-1: renders one column per stage, in pipeline order", () => {
    renderWithJobs(<BoardView />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);

    expect(headings).toEqual(STAGES.map((stage) => STAGE_META[stage].label));
  });

  it("BOARD-1: shows the number of jobs in each column", () => {
    renderWithJobs(<BoardView />);

    for (const stage of STAGES) {
      const expected = SEED_JOBS.filter((job) => job.stage === stage).length;
      expect(
        within(column(stage)).getByText(pluralize(expected, "application")),
      ).toBeInTheDocument();
    }
  });

  it("BOARD-1: reads the count to screen readers in grammatical English", () => {
    renderWithJobs(<BoardView />, { initialJobs: [SEED_JOBS[0]] });

    expect(within(column("interested")).getByText("1 application")).toBeInTheDocument();
    expect(within(column("offer")).getByText("0 applications")).toBeInTheDocument();
  });

  it("BOARD-3: files each job under exactly one column — its own stage", () => {
    renderWithJobs(<BoardView />);

    for (const job of SEED_JOBS) {
      const links = screen.getAllByRole("link", { name: job.role });
      expect(links).toHaveLength(1);
      expect(column(job.stage)).toContainElement(links[0]);
    }
  });

  it("BOARD-4: explains an empty column instead of leaving it blank", () => {
    const onlyInterested = SEED_JOBS.filter((job) => job.stage === "interested");
    renderWithJobs(<BoardView />, { initialJobs: onlyInterested });

    expect(
      within(column("offer")).getByText("Nothing at this stage yet."),
    ).toBeInTheDocument();
    expect(within(column("interested")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("BOARD-5: replaces the columns with a call to action on an empty board", () => {
    renderWithJobs(<BoardView />, { initialJobs: [] });

    expect(
      screen.getByRole("heading", { name: "No roles on the board yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Interested" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /add job/i }).length).toBeGreaterThan(0);
  });

  it("BOARD-6: pairs every stage colour with the stage name in text", () => {
    renderWithJobs(<BoardView />);

    // The dot itself is decorative; the label carries the meaning.
    for (const stage of STAGES) {
      expect(
        within(column(stage)).getByRole("heading", { level: 2 }),
      ).toHaveTextContent(STAGE_META[stage].label);
    }
  });
});

describe("active application count", () => {
  it("BOARD-2: counts every stage except rejected", () => {
    renderWithJobs(<BoardView />);

    const active = SEED_JOBS.filter((job) => job.stage !== "rejected").length;
    expect(screen.getByText(`${active} active applications`)).toBeInTheDocument();
  });

  it("BOARD-2: uses the singular for a board with one active job", () => {
    const one: Job[] = [{ ...SEED_JOBS[0], stage: "applied" }];
    renderWithJobs(<BoardView />, { initialJobs: one });

    expect(screen.getByText("1 active application")).toBeInTheDocument();
  });

  it("BOARD-2: does not count a rejected job as active", () => {
    const rejectedOnly: Job[] = [{ ...SEED_JOBS[0], stage: "rejected" }];
    renderWithJobs(<BoardView />, { initialJobs: rejectedOnly });

    expect(screen.getByText("0 active applications")).toBeInTheDocument();
  });
});

describe("job card", () => {
  const job = SEED_JOBS.find((j) => j.id === "fernwood-product-designer-growth")!;

  it("CARD-1: shows role, company, location and salary band", () => {
    renderWithJobs(<BoardView />);

    const card = screen.getByRole("link", { name: job.role }).closest("li")!;
    expect(within(card).getByText(job.company)).toBeInTheDocument();
    expect(within(card).getByText(job.location)).toBeInTheDocument();
    expect(within(card).getByText("$125k–$145k")).toBeInTheDocument();
  });

  it("CARD-1: falls back to Salary TBD when no band is known", () => {
    renderWithJobs(<BoardView />);

    const northbeam = screen
      .getByRole("link", { name: "Product Designer II" })
      .closest("li")!;
    expect(within(northbeam).getByText("Salary TBD")).toBeInTheDocument();
  });

  it("CARD-2: links the role title to its detail route", () => {
    renderWithJobs(<BoardView />);

    expect(screen.getByRole("link", { name: job.role })).toHaveAttribute(
      "href",
      `/board/${job.id}`,
    );
  });

  it("CARD-3: opens the posting in a new tab, safely, without nesting anchors", () => {
    renderWithJobs(<BoardView />);

    const card = screen.getByRole("link", { name: job.role }).closest("li")!;
    const posting = within(card).getByRole("link", { name: /^Posting/ });

    expect(posting).toHaveAttribute("href", job.postingUrl);
    expect(posting).toHaveAttribute("target", "_blank");
    expect(posting).toHaveAttribute("rel", "noopener noreferrer");
    // If the posting link were inside the card link, it would be unclickable.
    expect(posting.closest("a")).toBe(posting);
  });

  it("CARD-5: renders no posting link at all when no URL is on file", () => {
    const noUrl = [{ ...SEED_JOBS[0], postingUrl: "" }];
    renderWithJobs(<BoardView />, { initialJobs: noUrl });

    const card = screen
      .getByRole("link", { name: SEED_JOBS[0].role })
      .closest("li")!;
    expect(within(card).queryByRole("link", { name: /^Posting/ })).toBeNull();
    // An empty href resolves to the current page and would silently reload it.
    expect(card.querySelector('a[href=""]')).toBeNull();
  });

  it("CARD-5: refuses to render a javascript: posting link", () => {
    const hostile = [
      { ...SEED_JOBS[0], postingUrl: "javascript:alert(document.domain)" },
    ];
    renderWithJobs(<BoardView />, { initialJobs: hostile });

    const card = screen
      .getByRole("link", { name: SEED_JOBS[0].role })
      .closest("li")!;
    expect(within(card).queryByRole("link", { name: /^Posting/ })).toBeNull();
  });

  it("CARD-4: labels an applied job with its applied date", () => {
    renderWithJobs(<BoardView />);

    const card = screen.getByRole("link", { name: job.role }).closest("li")!;
    expect(within(card).getByText("Applied Jul 15")).toBeInTheDocument();
  });

  it("CARD-4: labels a job that is only a lead with its added date", () => {
    renderWithJobs(<BoardView />);

    const lead = screen
      .getByRole("link", { name: "Senior Product Designer" })
      .closest("li")!;
    expect(within(lead).getByText("Added Jul 22")).toBeInTheDocument();
  });
});
