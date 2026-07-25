import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardView } from "@/components/board/board-view";
import { SEED_JOBS, STAGE_META } from "@/lib/jobs";
import { freezeClock, renderWithJobs, screen, within } from "../test-utils";

const interested = () =>
  screen.getByRole("region", { name: STAGE_META.interested.label });

async function openDialog(user: ReturnType<typeof renderWithJobs>["user"]) {
  await user.click(screen.getByRole("button", { name: /add job/i }));
  return screen.getByRole("dialog", { name: "Add a job" });
}

beforeEach(() => {
  freezeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("opening the dialog", () => {
  it("ADD-1: opens a modal titled 'Add a job' and moves focus into it", async () => {
    const { user } = renderWithJobs(<BoardView />);
    expect(screen.queryByRole("dialog")).toBeNull();

    const dialog = await openDialog(user);

    expect(dialog).toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("ADD-2: marks company and role title as required", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    expect(within(dialog).getByLabelText("Company")).toBeRequired();
    expect(within(dialog).getByLabelText("Role title")).toBeRequired();
    expect(within(dialog).getByLabelText("Location")).not.toBeRequired();
  });

  it("ADD-1: hides the board behind it while open, as a modal should", async () => {
    const { user } = renderWithJobs(<BoardView />);
    expect(interested()).toBeInTheDocument();

    await openDialog(user);

    // Radix marks the rest of the page inert, so the board leaves the
    // accessibility tree entirely rather than staying tabbable behind the modal.
    expect(screen.queryByRole("region", { name: "Interested" })).toBeNull();
  });

  it("ADD-2: refuses to submit while the required fields are empty", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const before = within(interested()).getAllByRole("listitem").length;
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    // Native constraint validation blocks the submit, so the dialog stays put.
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(interested()).getAllByRole("listitem")).toHaveLength(before);
  });
});

describe("adding a job", () => {
  it("ADD-3: lands the new job in Interested and closes the dialog", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.type(within(dialog).getByLabelText("Location"), "Remote (US)");
    await user.type(
      within(dialog).getByLabelText("Minimum salary, in thousands"),
      "160",
    );
    await user.type(
      within(dialog).getByLabelText("Maximum salary, in thousands"),
      "190",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    expect(screen.queryByRole("dialog")).toBeNull();

    const card = screen
      .getByRole("link", { name: "Principal Designer" })
      .closest("li")!;
    expect(interested()).toContainElement(card);
    expect(within(card).getByText("Alpine Robotics")).toBeInTheDocument();
    expect(within(card).getByText("Remote (US)")).toBeInTheDocument();
    expect(within(card).getByText("$160k–$190k")).toBeInTheDocument();
  });

  it("ADD-3: dates the new job today and counts it as active", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const activeBefore = SEED_JOBS.filter((j) => j.stage !== "rejected").length;
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    const card = screen
      .getByRole("link", { name: "Principal Designer" })
      .closest("li")!;
    expect(within(card).getByText("Added Jul 25")).toBeInTheDocument();
    expect(
      screen.getByText(`${activeBefore + 1} active applications`),
    ).toBeInTheDocument();
  });

  it("ADD-4: stores a blank location as 'Location TBD'", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    const card = screen
      .getByRole("link", { name: "Principal Designer" })
      .closest("li")!;
    expect(within(card).getByText("Location TBD")).toBeInTheDocument();
  });

  it("ADD-4: treats an empty salary band as unknown, not as zero", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    const card = screen
      .getByRole("link", { name: "Principal Designer" })
      .closest("li")!;
    expect(within(card).getByText("Salary TBD")).toBeInTheDocument();
  });
});

describe("the resume dropzone", () => {
  it("ADD-5: swaps the dropzone for a removable chip once a file is chosen", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    const input = within(dialog).getByLabelText(/resume/i, { selector: "input" });
    await user.upload(
      input,
      new File(["cv"], "resume_principal_v2.pdf", { type: "application/pdf" }),
    );

    expect(within(dialog).getByText("resume_principal_v2.pdf")).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Drop your resume here/i),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: /remove resume_principal_v2\.pdf/i }),
    );
    expect(within(dialog).getByText(/Drop your resume here/i)).toBeInTheDocument();
  });
});

describe("dismissing the dialog", () => {
  it("ADD-6: Cancel closes without adding anything", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const before = within(interested()).getAllByRole("listitem").length;
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Discarded Co");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(interested()).getAllByRole("listitem")).toHaveLength(before);
    expect(screen.queryByText("Discarded Co")).toBeNull();
  });

  it("ADD-6: returns focus to the control that opened it", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const trigger = screen.getByRole("button", { name: /add job/i });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("ADD-6: the close button also dismisses, and clears a staged resume", async () => {
    const { user } = renderWithJobs(<BoardView />);
    let dialog = await openDialog(user);

    await user.upload(
      within(dialog).getByLabelText(/resume/i, { selector: "input" }),
      new File(["cv"], "stale.pdf", { type: "application/pdf" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    dialog = await openDialog(user);
    expect(within(dialog).queryByText("stale.pdf")).toBeNull();
    expect(within(dialog).getByText(/Drop your resume here/i)).toBeInTheDocument();
  });
});
