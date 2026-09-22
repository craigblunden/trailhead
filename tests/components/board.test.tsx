import { describe, expect, it } from "vitest";
import { act } from "react";

import { BoardView } from "@/components/board/board-view";
import { STAGES, STAGE_META, pluralize, type Job } from "@/lib/jobs";
import { ActionError } from "@/components/action-client";
import { fakeTransfer } from "../fakes/data-transfer";
import { SEED_JOBS } from "../fixtures/jobs";
import {
  fireEvent,
  renderWithJobs,
  screen,
  waitFor,
  within,
} from "../test-utils";

/** The column `<section>` for a stage, located by its visible heading. */
function column(stage: (typeof STAGES)[number]) {
  return screen.getByRole("region", { name: STAGE_META[stage].label });
}

/** The card `<li>` for a job, located by its role link. */
function card(role: string) {
  return screen.getByRole("link", { name: role }).closest("li")!;
}

/** Drags `source` onto `target`, the way a browser sequences the native events. */
function dragTo(source: Element, target: Element) {
  const dataTransfer = fakeTransfer();
  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(source, { dataTransfer });
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

    expect(
      within(column("interested")).getByText("1 application"),
    ).toBeInTheDocument();
    expect(
      within(column("offer")).getByText("0 applications"),
    ).toBeInTheDocument();
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
    const onlyInterested = SEED_JOBS.filter(
      (job) => job.stage === "interested",
    );
    renderWithJobs(<BoardView />, { initialJobs: onlyInterested });

    expect(
      within(column("offer")).getByText("Nothing at this stage yet."),
    ).toBeInTheDocument();
    expect(within(column("interested")).getAllByRole("listitem")).toHaveLength(
      1,
    );
  });

  it("BOARD-5: replaces the columns with a call to action on an empty board", () => {
    renderWithJobs(<BoardView />, { initialJobs: [] });

    expect(
      screen.getByRole("heading", { name: "No roles on the board yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Interested" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /add job/i }).length,
    ).toBeGreaterThan(0);
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
    expect(
      screen.getByText(`${active} active applications`),
    ).toBeInTheDocument();
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

describe("searching the board", () => {
  function search() {
    return screen.getByRole("searchbox", { name: /search jobs/i });
  }

  it("SEARCH-1: shows every job when the search box is empty", () => {
    renderWithJobs(<BoardView />);

    for (const job of SEED_JOBS) {
      expect(screen.getByRole("link", { name: job.role })).toBeInTheDocument();
    }
  });

  it("SEARCH-1: filters cards by role", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "Staff UX Designer");

    expect(
      screen.getByRole("link", { name: "Staff UX Designer" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Product Designer, Growth" }),
    ).toBeNull();
  });

  it("SEARCH-1: filters cards by company", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "Fernwood");

    expect(
      screen.getByRole("link", { name: "Product Designer, Growth" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Staff UX Designer" }),
    ).toBeNull();
  });

  it("SEARCH-1: matches case-insensitively and on a partial word", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "cobalt");

    expect(
      screen.getByRole("link", { name: "Staff UX Designer" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("SEARCH-1: matches role across every job that shares those words", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "product designer");

    const matches = [
      "Senior Product Designer",
      "Product Designer, Growth",
      "Lead Product Designer",
      "Product Designer II",
      "Product Designer",
    ];
    for (const role of matches) {
      expect(screen.getByRole("link", { name: role })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("link", { name: "Staff UX Designer" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Senior UX Designer" }),
    ).toBeNull();
  });

  it("SEARCH-1: tells a stage with no matches apart from a stage with no jobs", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "Fernwood");

    // Fernwood's own job is Applied; every other stage has real jobs that just don't match.
    expect(
      within(column("interested")).getByText("No matches in this stage."),
    ).toBeInTheDocument();
    expect(
      within(column("applied")).queryByText(
        /no matches|nothing at this stage/i,
      ),
    ).toBeNull();
  });

  it("SEARCH-2: explains when nothing matches, and offers to clear the search", async () => {
    const { user } = renderWithJobs(<BoardView />);

    await user.type(search(), "zzz-no-such-role");

    expect(
      screen.getByRole("heading", { name: "No jobs match your search" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search()).toHaveValue("");
    expect(
      screen.getByRole("link", { name: "Staff UX Designer" }),
    ).toBeInTheDocument();
  });

  it("SEARCH-3: leaves the empty-board state alone when there are no jobs at all", () => {
    renderWithJobs(<BoardView />, { initialJobs: [] });

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "No roles on the board yet" }),
    ).toBeInTheDocument();
  });
});

describe("job card", () => {
  const job = SEED_JOBS.find(
    (j) => j.id === "fernwood-product-designer-growth",
  )!;

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

describe("moving a job between stages", () => {
  const job = SEED_JOBS.find(
    (j) => j.id === "fernwood-product-designer-growth",
  )!;

  it("DND-2: dropping a card on another column moves the job to that stage", async () => {
    const { trail } = renderWithJobs(<BoardView />);

    dragTo(card(job.role), column("interviewing"));

    await waitFor(() =>
      expect(column("interviewing")).toContainElement(
        screen.getByRole("link", { name: job.role }),
      ),
    );
    expect(trail.jobs.setStage).toHaveBeenCalledWith(job.id, "interviewing");
    expect(trail.jobs.setStage).toHaveBeenCalledTimes(1);
  });

  it("DND-3: dropping a card on its own column asks the store for nothing", async () => {
    const { trail } = renderWithJobs(<BoardView />);

    dragTo(card(job.role), column(job.stage));

    // Give a write every chance to have been sent before concluding it was not.
    await act(async () => {});
    expect(trail.jobs.setStage).not.toHaveBeenCalled();
    expect(column(job.stage)).toContainElement(
      screen.getByRole("link", { name: job.role }),
    );
  });

  it("DND-4: ignores a drop that carries no job — text dragged in from outside", async () => {
    const { trail } = renderWithJobs(<BoardView />);
    const dataTransfer = fakeTransfer();
    dataTransfer.setData("text/plain", job.id);

    fireEvent.dragOver(column("offer"), { dataTransfer });
    fireEvent.drop(column("offer"), { dataTransfer });

    await act(async () => {});
    expect(trail.jobs.setStage).not.toHaveBeenCalled();
  });

  it("DND-5: a column shows it is a drop target while a job is over it, and stops when it leaves", () => {
    renderWithJobs(<BoardView />);
    const dataTransfer = fakeTransfer();
    const target = column("offer");

    fireEvent.dragStart(card(job.role), { dataTransfer });
    expect(target).not.toHaveAttribute("data-drop-target");

    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveAttribute("data-drop-target", "true");

    // Moving over the column's own children fires leave/enter pairs; the column stays lit.
    const inner = within(target).getByRole("heading", { level: 2 });
    fireEvent.dragEnter(inner, { dataTransfer });
    fireEvent.dragLeave(target, { dataTransfer });
    expect(target).toHaveAttribute("data-drop-target", "true");

    fireEvent.dragLeave(inner, { dataTransfer });
    expect(target).not.toHaveAttribute("data-drop-target");
  });

  it("DND-5: a column stops being a drop target once the card is dropped", () => {
    renderWithJobs(<BoardView />);
    const target = column("offer");

    dragTo(card(job.role), target);

    expect(target).not.toHaveAttribute("data-drop-target");
  });

  it("DND-6: the Move to menu offers every other stage, and choosing one moves the job", async () => {
    const { user, trail } = renderWithJobs(<BoardView />);

    await user.click(
      within(card(job.role)).getByRole("button", {
        name: `Move ${job.role} at ${job.company}`,
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(
      STAGES.filter((stage) => stage !== job.stage).map(
        (stage) => STAGE_META[stage].label,
      ),
    );

    await user.click(within(menu).getByRole("menuitem", { name: "Offer" }));

    await waitFor(() =>
      expect(column("offer")).toContainElement(
        screen.getByRole("link", { name: job.role }),
      ),
    );
    expect(trail.jobs.setStage).toHaveBeenCalledWith(job.id, "offer");
  });

  it("DND-6: the Move to menu works from the keyboard alone", async () => {
    const { user, trail } = renderWithJobs(<BoardView />);
    const trigger = within(card(job.role)).getByRole("button", {
      name: /^Move /,
    });

    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    // Focus lands on the first item; Interested is the first stage other than Applied.
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(column("interested")).toContainElement(
        screen.getByRole("link", { name: job.role }),
      ),
    );
    expect(trail.jobs.setStage).toHaveBeenCalledWith(job.id, "interested");
  });

  it("DND-7: announces a move made from the board, since the card leaves the column the user was in", async () => {
    const { user } = renderWithJobs(<BoardView />);

    dragTo(card(job.role), column("interviewing"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `Moved ${job.role} to Interviewing`,
      ),
    );

    await user.click(
      within(card(job.role)).getByRole("button", { name: /^Move / }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Closed" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `Moved ${job.role} to Closed`,
      ),
    );
  });

  it("DND-8: a card shows it is in flight from drag start to drag end", () => {
    renderWithJobs(<BoardView />);
    const dataTransfer = fakeTransfer();
    const source = card(job.role);

    expect(source).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(source, { dataTransfer });
    expect(source).toHaveAttribute("data-dragging", "true");
    fireEvent.dragEnd(source, { dataTransfer });
    expect(source).not.toHaveAttribute("data-dragging");
  });

  it("DND-7: announces nothing when a card is dropped where it already is", async () => {
    renderWithJobs(<BoardView />);

    dragTo(card(job.role), column(job.stage));

    await act(async () => {});
    expect(screen.queryByRole("status")).toBeEmptyDOMElement();
  });

  it("DND-7: announces the same move again when it is made again", async () => {
    renderWithJobs(<BoardView />);
    const status = () => screen.getByRole("status");

    dragTo(card(job.role), column("interviewing"));
    await waitFor(() => expect(status()).toHaveTextContent("to Interviewing"));
    const first = status().firstElementChild;

    dragTo(card(job.role), column("applied"));
    await waitFor(() => expect(status()).toHaveTextContent("to Applied"));
    dragTo(card(job.role), column("interviewing"));
    await waitFor(() => expect(status()).toHaveTextContent("to Interviewing"));

    // A live region announces what is added to it; the same text in the same node says nothing.
    expect(status().firstElementChild).not.toBe(first);
  });

  it("DND-9: a refused drop rolls the card back and reports the failure without blocking", async () => {
    const { trail } = renderWithJobs(<BoardView />);
    // After a beat, the way a real server refuses, so the optimistic move is on screen to be seen.
    trail.jobs.setStage.mockImplementationOnce(
      () =>
        new Promise((_, fail) =>
          setTimeout(
            () =>
              fail(
                new ActionError(
                  "failed",
                  "The trail is closed for maintenance.",
                ),
              ),
            150,
          ),
        ),
    );

    dragTo(card(job.role), column("offer"));
    await waitFor(() =>
      expect(column("offer")).toContainElement(
        screen.getByRole("link", { name: job.role }),
      ),
    );

    await waitFor(() =>
      expect(column(job.stage)).toContainElement(
        screen.getByRole("link", { name: job.role }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The trail is closed for maintenance.",
    );
    // The board stays usable: the Move to menu is still there to try again.
    expect(
      within(card(job.role)).getByRole("button", { name: /^Move / }),
    ).toBeEnabled();
  });
});
