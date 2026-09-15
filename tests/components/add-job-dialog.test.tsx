import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardView } from "@/components/board/board-view";
import { STAGE_META } from "@/lib/jobs";
import { createTrail } from "../fakes/trail";
import { SEED_JOBS } from "../fixtures/jobs";
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

  it("ADD-2: says what the asterisk beside a field means", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    expect(within(dialog).getByText(/are required/i)).toBeInTheDocument();
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

describe("the optional contact", () => {
  async function addJobWithFields(
    user: ReturnType<typeof renderWithJobs>["user"],
    fill: (dialog: HTMLElement) => Promise<void>,
  ) {
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await fill(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));
    return dialog;
  }

  const detailsToggle = (dialog: HTMLElement) =>
    within(dialog).getByRole("button", { name: "Add their details" });

  it("ADD-8: leaves the contact section blank when nobody was entered", async () => {
    const { user, trail } = renderWithJobs(<BoardView />);
    const before = (await trail.contacts.list()).length;

    await addJobWithFields(user, async () => {});

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trail.jobs.add).toHaveBeenCalledWith(expect.objectContaining({ contact: null }));
    await expect(trail.contacts.list()).resolves.toHaveLength(before);
  });

  it("ADD-8: saves the person entered with the job and links them to it", async () => {
    const { user, trail } = renderWithJobs(<BoardView />);

    await addJobWithFields(user, async (dialog) => {
      await user.type(within(dialog).getByLabelText("Name"), "Dana Pike");
      await user.click(detailsToggle(dialog));
      await user.type(within(dialog).getByLabelText("Title"), "Talent Partner");
      await user.type(within(dialog).getByLabelText("Agency"), "Northstar Talent");
      await user.type(within(dialog).getByLabelText("Email"), "dana@northstar.example");
      await user.type(within(dialog).getByLabelText("Phone"), "0400 000 000");
    });

    expect(trail.jobs.add).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: {
          name: "Dana Pike",
          kind: "recruiter",
          title: "Talent Partner",
          agency: "Northstar Talent",
          email: "dana@northstar.example",
          phone: "0400 000 000",
          linkedinUrl: "",
        },
      }),
    );
    // One Contact of the user's, on this Job and no other.
    const dana = (await trail.contacts.list()).filter((contact) => contact.name === "Dana Pike");
    expect(dana).toEqual([
      expect.objectContaining({ agency: "Northstar Talent", kind: "recruiter", jobCount: 1 }),
    ]);
  });

  it("ADD-8: asks for a name as soon as any other contact field is used", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);
    await user.click(detailsToggle(dialog));

    expect(within(dialog).getByLabelText("Name")).not.toBeRequired();

    await user.type(within(dialog).getByLabelText("Email"), "dana@northstar.example");

    expect(within(dialog).getByLabelText("Name")).toBeRequired();
  });

  it("ADD-8: keeps the details out of the way until they are asked for", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    // The section is closed, so its fields are not in the accessibility tree at all.
    expect(within(dialog).queryByRole("textbox", { name: "Email" })).toBeNull();
    expect(detailsToggle(dialog)).toHaveAttribute("aria-expanded", "false");

    await user.click(detailsToggle(dialog));

    expect(within(dialog).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(detailsToggle(dialog)).toHaveAttribute("aria-expanded", "true");
  });

  it("ADD-8: closing the details section hides the fields without discarding them", async () => {
    const { user, trail } = renderWithJobs(<BoardView />);

    await addJobWithFields(user, async (dialog) => {
      await user.type(within(dialog).getByLabelText("Name"), "Dana Pike");
      await user.click(detailsToggle(dialog));
      await user.type(within(dialog).getByLabelText("Phone"), "0400 000 000");
      await user.click(detailsToggle(dialog));

      // Closed again, and saying so — the phone number is still going to be saved.
      expect(within(dialog).getByText("1 detail filled in")).toBeInTheDocument();
    });

    expect(trail.jobs.add).toHaveBeenCalledWith(
      expect.objectContaining({ contact: expect.objectContaining({ phone: "0400 000 000" }) }),
    );
  });
});

describe("choosing a contact the user already has", () => {
  const PRIYA = {
    id: "saved-priya",
    name: "Priya Raman",
    kind: "recruiter",
    agency: "Northstar Talent",
  } as const;

  const withSavedContacts = () =>
    renderWithJobs(<BoardView />, {
      trail: createTrail({
        jobs: SEED_JOBS,
        contacts: [PRIYA, { id: "saved-sam", name: "Sam Ridge", kind: "hiring_manager" }],
      }),
    });

  it("ADD-8: searches saved contacts as the name is typed", async () => {
    const { user } = withSavedContacts();
    const dialog = await openDialog(user);

    // Nothing is offered until there is something to search for.
    expect(within(dialog).queryByRole("list", { name: "Matching contacts" })).toBeNull();

    await user.type(within(dialog).getByLabelText("Name"), "priya");

    const matches = within(dialog).getByRole("list", { name: "Matching contacts" });
    expect(within(matches).getAllByRole("listitem")).toHaveLength(1);
    expect(within(matches).getByText("Recruiter · Northstar Talent")).toBeInTheDocument();
  });

  it("ADD-8: links the chosen contact by id rather than saving them a second time", async () => {
    const { user, trail } = withSavedContacts();
    const before = await trail.contacts.list();
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.type(within(dialog).getByLabelText("Name"), "priya");
    await user.click(within(dialog).getByRole("button", { name: /Priya Raman/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    expect(trail.jobs.add).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { contactId: PRIYA.id } }),
    );
    // Still one Priya Raman, now on one more Job.
    const after = await trail.contacts.list();
    expect(after.map((contact) => contact.name)).toEqual(before.map((contact) => contact.name));
    const priya = (name: string) => (contact: { name: string }) => contact.name === name;
    expect(after.find(priya(PRIYA.name))!.jobCount).toBe(
      before.find(priya(PRIYA.name))!.jobCount + 1,
    );
  });

  it("ADD-8: 'Change' puts the search back, so the wrong person is not stuck on the job", async () => {
    const { user } = withSavedContacts();
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Name"), "priya");
    await user.click(within(dialog).getByRole("button", { name: /Priya Raman/ }));

    // The chosen person replaces the fields they would have been typed into.
    expect(within(dialog).queryByLabelText("Name")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Change" }));

    expect(within(dialog).getByLabelText("Name")).toHaveValue("");
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

  it("ADD-6: the close button also dismisses", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Company"), "Discarded Co");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Discarded Co")).toBeNull();
  });

  it("ADD-7: asks for no file — documents are attached from the job's own page (ticket 17)", async () => {
    const { user } = renderWithJobs(<BoardView />);
    const dialog = await openDialog(user);

    expect(dialog.querySelector('input[type="file"]')).toBeNull();
  });
});
