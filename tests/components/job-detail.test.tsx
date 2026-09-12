import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionError } from "@/components/action-client";
import { JobDetail } from "@/components/job/job-detail";
import type { Job } from "@/lib/jobs";
import type { JobPatch } from "@/lib/jobs-client";
import { createTrail } from "../fakes/trail";
import { SEED_JOBS } from "../fixtures/jobs";
import { freezeClock, renderWithJobs, screen, within } from "../test-utils";

const HARVEST = "harvest-lead-product-designer";
const harvest = SEED_JOBS.find((job) => job.id === HARVEST)!;

const detailsPanel = () => screen.getByRole("region", { name: "Details" });

/** Activity entries, newest first, as "<label> <date>". */
function activityEntries() {
  const region = screen.getByRole("region", { name: "Activity" });
  return within(region)
    .getAllByRole("listitem")
    .map((li) => {
      const time = li.querySelector("time")!;
      return `${time.previousElementSibling?.textContent} ${time.textContent}`;
    });
}

async function selectStage(
  user: ReturnType<typeof renderWithJobs>["user"],
  stage: string,
) {
  await user.click(screen.getByRole("combobox", { name: "Application stage" }));
  await user.click(await screen.findByRole("option", { name: stage }));
}

beforeEach(() => {
  freezeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rendering a job", () => {
  it("DET-1: leads with the role, company and location", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(harvest.role);
    expect(
      screen.getByText(`${harvest.company} · ${harvest.location}`),
    ).toBeInTheDocument();
  });

  it("DET-1: shows the salary band, applied date and resume on file", async () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(
      screen.getByLabelText("Minimum salary expectation, in thousands"),
    ).toHaveValue(140);
    expect(
      screen.getByLabelText("Maximum salary expectation, in thousands"),
    ).toHaveValue(165);
    expect(screen.getByText("June 30, 2026")).toBeInTheDocument();
    // The application kit reads the document list first.
    expect(await screen.findByText("resume_lead_v1.pdf")).toBeInTheDocument();
  });

  it("DET-1: labels the date as 'Added' for a job never applied to", () => {
    renderWithJobs(<JobDetail jobId="meridian-senior-product-designer" />);

    expect(within(detailsPanel()).getByText("Added")).toBeInTheDocument();
    expect(within(detailsPanel()).getByText("July 22, 2026")).toBeInTheDocument();
  });

  it("DET-2: explains an unknown job rather than crashing", () => {
    renderWithJobs(<JobDetail jobId="does-not-exist" />);

    expect(
      screen.getByRole("heading", { name: /This job isn’t on your trail/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your trail" })).toHaveAttribute(
      "href",
      "/board",
    );
  });
});

describe("changing the stage", () => {
  it("DET-3: moves the job and logs the move, dated today", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);
    expect(activityEntries()[0]).toContain("Portfolio review scheduled");

    await selectStage(user, "Offer");

    expect(screen.getByRole("combobox", { name: "Application stage" })).toHaveTextContent(
      "Offer",
    );
    expect(activityEntries()[0]).toBe("Moved to Offer Jul 25");
  });

  it("DET-4: backfills an applied date when a lead moves into the pipeline", async () => {
    const { user } = renderWithJobs(
      <JobDetail jobId="meridian-senior-product-designer" />,
    );
    expect(within(detailsPanel()).getByText("Added")).toBeInTheDocument();

    await selectStage(user, "Applied");

    expect(within(detailsPanel()).getByText("Applied")).toBeInTheDocument();
    expect(within(detailsPanel()).getByText("July 25, 2026")).toBeInTheDocument();
  });

  it("DET-4: never invents an applied date when moving back to Interested", async () => {
    const lead: Job[] = [
      { ...harvest, stage: "applied", appliedOn: null, activity: [] },
    ];
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, {
      initialJobs: lead,
    });

    await selectStage(user, "Interested");

    expect(within(detailsPanel()).getByText("Added")).toBeInTheDocument();
    expect(within(detailsPanel()).queryByText("July 25, 2026")).toBeNull();
  });

  it("DET-4: leaves an existing applied date untouched", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await selectStage(user, "Offer");

    expect(within(detailsPanel()).getByText("June 30, 2026")).toBeInTheDocument();
  });

  it("DET-5: re-selecting the current stage logs nothing", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);
    const before = activityEntries();

    await selectStage(user, "Interviewing");

    expect(activityEntries()).toEqual(before);
  });
});

describe("editing free text", () => {
  const saveButton = () => screen.getByRole("button", { name: "Save description" });

  it("DET-6: saves the description when asked, not while typing", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);
    const field = screen.getByRole("textbox", { name: "Job description" });
    expect(saveButton()).toBeDisabled();

    await user.clear(field);
    await user.type(field, "Rewritten description.");
    await user.tab();

    expect(field).toHaveValue("Rewritten description.");
    expect(trail.jobs.update).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());

    expect(trail.jobs.update).toHaveBeenCalledTimes(1);
    expect(trail.jobs.update).toHaveBeenCalledWith(HARVEST, {
      description: "Rewritten description.",
    });
    expect(field).toHaveValue("Rewritten description.");
    expect(saveButton()).toBeDisabled();
  });

  it("DET-6: typing the description back to what is saved leaves nothing to save", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, {
      initialJobs: [{ ...harvest, description: "Short" }],
    });
    const field = screen.getByRole("textbox", { name: "Job description" });

    await user.type(field, "!");
    expect(saveButton()).toBeEnabled();
    await user.keyboard("{Backspace}");

    expect(field).toHaveValue("Short");
    expect(saveButton()).toBeDisabled();
  });

  it("DET-6: a refused description save says why and keeps the text to fix", async () => {
    const trail = createTrail({ jobs: SEED_JOBS });
    const update = vi.fn<(id: string, patch: JobPatch) => Promise<Job>>().mockRejectedValue(
      new ActionError("invalid", "Check the highlighted fields.", {
        description: "Keep the description under 20,000 characters",
      }),
    );
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, {
      trail,
      client: { ...trail.jobs, update },
    });
    const field = screen.getByRole("textbox", { name: "Job description" });

    await user.clear(field);
    await user.type(field, "Too long, apparently.");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Keep the description under 20,000 characters",
    );
    expect(field).toHaveValue("Too long, apparently.");
    expect(saveButton()).toBeEnabled();
    expect(trail.jobsNow().find((job) => job.id === HARVEST)?.description).toBe(
      harvest.description,
    );
  });

  it("DET-6: saves notes when asked, not while typing", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);
    const field = screen.getByRole("textbox", { name: "Notes" });
    const save = screen.getByRole("button", { name: "Save notes" });
    expect(save).toBeDisabled();

    await user.clear(field);
    await user.type(field, "Ask about the design team's size.");
    await user.tab();

    expect(field).toHaveValue("Ask about the design team's size.");
    expect(trail.jobs.update).not.toHaveBeenCalled();
    expect(save).toBeEnabled();

    await user.click(save);

    expect(trail.jobs.update).toHaveBeenCalledTimes(1);
    expect(trail.jobs.update).toHaveBeenCalledWith(HARVEST, {
      notes: "Ask about the design team's size.",
    });
    expect(field).toHaveValue("Ask about the design team's size.");
    expect(save).toBeDisabled();
  });

  it("DET-6: each field saves on its own, without touching the other", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.type(screen.getByRole("textbox", { name: "Job description" }), " More.");
    await user.type(screen.getByRole("textbox", { name: "Notes" }), " Later.");
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(trail.jobs.update).toHaveBeenCalledTimes(1);
    expect(trail.jobs.update).toHaveBeenCalledWith(HARVEST, { notes: `${harvest.notes} Later.` });
    expect(saveButton()).toBeEnabled();
  });
});

describe("supporting panels", () => {
  it("DET-7: lists each contact with their kind, a mailto link, and a link to the contact", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);
    const contacts = screen.getByRole("region", { name: "Contacts" });

    expect(within(contacts).getByRole("link", { name: "Tom Okafor" })).toHaveAttribute(
      "href",
      "/contacts/c1",
    );
    expect(within(contacts).getByText("Hiring manager")).toBeInTheDocument();
    expect(
      within(contacts).getByRole("link", { name: "t.okafor@harvest.co" }),
    ).toHaveAttribute("href", "mailto:t.okafor@harvest.co");
    expect(within(contacts).getAllByRole("listitem")).toHaveLength(2);
  });

  it("DET-7: explains an empty contact list", () => {
    renderWithJobs(<JobDetail jobId="cobalt-staff-ux-designer" />);
    const contacts = screen.getByRole("region", { name: "Contacts" });

    expect(within(contacts).getByText(/No contacts saved/)).toBeInTheDocument();
  });

  it("DET-8: renders the activity trail newest first, with short dates", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(activityEntries()).toEqual([
      "Portfolio review scheduled Jul 20",
      "Moved to Interviewing Jul 14",
      "Applied with resume_lead_v1.pdf Jun 30",
      "Added to board — Interested Jun 26",
    ]);
  });

  it("DET-9: offers to write a cover letter, with the letters left this week", async () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(await screen.findByText("5 of 5 left this week")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write cover letter" })).toBeEnabled();
  });
});

describe("the posting link", () => {
  it("DET-10: opens the posting safely in a new tab", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);
    const link = screen.getByRole("link", { name: /Open posting/ });

    expect(link).toHaveAttribute("href", harvest.postingUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("DET-10: falls back to a genuinely disabled button with no URL on file", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />, {
      initialJobs: [{ ...harvest, postingUrl: "" }],
    });

    expect(screen.queryByRole("link", { name: /posting/i })).toBeNull();
    expect(screen.getByRole("button", { name: /No posting link/ })).toBeDisabled();
  });

  it("DET-10: treats a javascript: URL as no link at all", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />, {
      initialJobs: [{ ...harvest, postingUrl: "javascript:alert(1)" }],
    });

    expect(screen.queryByRole("link", { name: /posting/i })).toBeNull();
    expect(screen.getByRole("button", { name: /No posting link/ })).toBeDisabled();
  });
});

describe("a refused edit (architecture ticket 01)", () => {
  it("DET-12: a salary the server refuses says why, in the server's own words", async () => {
    const trail = createTrail({ jobs: SEED_JOBS });
    const update = vi.fn<(id: string, patch: JobPatch) => Promise<Job>>().mockRejectedValue(
      new ActionError("invalid", "Check the highlighted fields.", {
        salaryMin: "Enter a whole number of thousands",
      }),
    );
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { trail, client: { ...trail.jobs, update } });
    const minimum = screen.getByLabelText("Minimum salary expectation, in thousands");

    await user.clear(minimum);
    await user.type(minimum, "1.5");
    await user.tab();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Enter a whole number of thousands");
    expect(alert).not.toHaveTextContent("Check the highlighted fields");
    expect(update).toHaveBeenLastCalledWith(HARVEST, { salaryMin: 1.5 });
  });
});

describe("panel structure", () => {
  it("DET-11: exposes each sidebar panel as a labelled region with an h2", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    for (const name of ["Details", "Contacts", "Activity"]) {
      const region = screen.getByRole("region", { name });
      expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
        name,
      );
    }
  });
});
