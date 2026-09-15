import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionError } from "@/components/action-client";
import { jobCache } from "@/components/job-cache";
import { JobDetail } from "@/components/job/job-detail";
import { SummitScenes } from "@/components/job/summit-scenes";
import { LOCATION_FALLBACK } from "@/lib/job-fields";
import { STAGES, type Job, type Stage } from "@/lib/jobs";
import type { JobPatch, JobsClient } from "@/lib/jobs-client";
import { createTrail } from "../fakes/trail";
import { SEED_JOBS } from "../fixtures/jobs";
import { freezeClock, renderWithJobs, screen, waitFor, within } from "../test-utils";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/board/harvest-lead-product-designer" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegment: () => null,
}));

const HARVEST = "harvest-lead-product-designer";
const harvest = SEED_JOBS.find((job) => job.id === HARVEST)!;

const detailsPanel = () => screen.getByRole("region", { name: "Details" });

/** A request still on its way, settled when the test says (mirrors job-cache.test.ts). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

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
  navigation.replace.mockReset();
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

  it("DET-14: a failed list load says so, with a way to retry — not 'this job isn't on your trail'", async () => {
    let attempts = 0;
    const client: JobsClient = {
      ...createTrail({ jobs: SEED_JOBS }).jobs,
      list: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("database unreachable");
        return SEED_JOBS;
      },
    };
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, {
      client,
      seedCache: false,
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn.t load this job/i);
    expect(
      screen.queryByRole("heading", { name: /This job isn’t on your trail/ }),
    ).toBeNull();

    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(harvest.role);
  });

  it("DET-15: a job opened at the optimistic id it was added under follows the redirect once the server assigns its own", async () => {
    const { queryClient } = renderWithJobs(<JobDetail jobId="optimistic-new" />, {
      initialJobs: [],
    });
    const cache = jobCache(queryClient);
    const send = deferred<Job>();

    cache.add(() => ({ ...harvest, id: "optimistic-new" }), {
      send: () => send.promise,
      fallback: "That job wasn't saved.",
    });
    // Shown at once from the optimistic entry — no redirect yet, nothing to wait on.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(harvest.role),
    );
    expect(navigation.replace).not.toHaveBeenCalled();

    send.resolve({ ...harvest, id: "server-assigned-id" });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/board/server-assigned-id"),
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

describe("editing the applied date", () => {
  it("DET-16: corrects a backfilled applied date by picking a day, saving and closing at once", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(within(detailsPanel()).getByRole("button", { name: "June 30, 2026" }));
    await user.click(screen.getByRole("button", { name: /June 20th, 2026/ }));

    expect(
      within(detailsPanel()).getByRole("button", { name: "June 20, 2026" }),
    ).toBeInTheDocument();
    // The popover is gone, not just visually replaced: its own controls no longer exist.
    expect(screen.queryByRole("button", { name: "Go to the Next Month" })).toBeNull();
  });

  it("DET-16: never offers a day after today", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(within(detailsPanel()).getByRole("button", { name: "June 30, 2026" }));
    await user.click(screen.getByRole("button", { name: "Go to the Next Month" }));

    expect(screen.getByRole("button", { name: /July 26th, 2026/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /July 24th, 2026/ })).toBeEnabled();
  });

  it("DET-16: a job never applied to has no calendar to open — only the read-only added date", () => {
    renderWithJobs(<JobDetail jobId="meridian-senior-product-designer" />);

    expect(within(detailsPanel()).getByText("Added")).toBeInTheDocument();
    expect(
      within(detailsPanel()).queryByRole("button", { name: /2026/ }),
    ).toBeNull();
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

describe("a rejected job", () => {
  const QUILL = "quill-product-designer";
  const rejectionLetterField = () => screen.getByRole("textbox", { name: "Rejection letter" });
  const saveRejectionLetter = () => screen.getByRole("button", { name: "Save rejection letter" });

  it("DET-17: saves the Rejection letter when asked, not while typing", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={QUILL} />);
    expect(saveRejectionLetter()).toBeDisabled();

    await user.type(rejectionLetterField(), "We have decided to move forward with other candidates.");
    await user.tab();

    expect(trail.jobs.update).not.toHaveBeenCalled();
    await user.click(saveRejectionLetter());

    expect(trail.jobs.update).toHaveBeenCalledTimes(1);
    expect(trail.jobs.update).toHaveBeenCalledWith(QUILL, {
      rejectionLetter: "We have decided to move forward with other candidates.",
    });
    expect(rejectionLetterField()).toHaveValue("We have decided to move forward with other candidates.");
    expect(saveRejectionLetter()).toBeDisabled();
  });

  it("DET-17: a job in an Active stage has no Rejection letter to add, and its description open", () => {
    renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(screen.queryByRole("textbox", { name: "Rejection letter" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show description" })).not.toBeInTheDocument();
  });

  it("DET-18: the description is folded away on a rejected job, and opens to edit", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={QUILL} />);
    const toggle = screen.getByRole("button", { name: "Show description" });

    expect(screen.getByRole("heading", { name: "Job description" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Job description" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Hide description" })).toHaveAttribute("aria-expanded", "true");
    await user.type(screen.getByRole("textbox", { name: "Job description" }), " Updated.");
    await user.click(screen.getByRole("button", { name: "Save description" }));
    expect(trail.jobs.update).toHaveBeenCalledWith(QUILL, {
      description: `${SEED_JOBS.find((job) => job.id === QUILL)!.description} Updated.`,
    });
  });

  it("DET-18: moving a job to Rejected folds its description away", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await selectStage(user, "Rejected");

    expect(screen.queryByRole("textbox", { name: "Job description" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show description" })).toBeInTheDocument();
  });

  it("DET-18: an unsaved description edit folded away still says so, and is there when shown again", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.type(screen.getByRole("textbox", { name: "Job description" }), " Unsaved.");
    await selectStage(user, "Rejected");

    const description = screen.getByRole("region", { name: "Job description" });
    expect(within(description).getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show description" }));
    expect(screen.getByRole("textbox", { name: "Job description" })).toHaveValue(`${harvest.description} Unsaved.`);
    expect(trail.jobs.update).not.toHaveBeenCalled();
  });

  it("DET-17: a Rejection letter is kept, out of sight, while the job is off rejected, and back when it returns", async () => {
    const quill = SEED_JOBS.find((job) => job.id === QUILL)!;
    const { user } = renderWithJobs(<JobDetail jobId={QUILL} />, {
      initialJobs: [{ ...quill, rejectionLetter: "Thank you for your time." }],
    });
    expect(rejectionLetterField()).toHaveValue("Thank you for your time.");

    await selectStage(user, "Interviewing");
    expect(screen.queryByRole("textbox", { name: "Rejection letter" })).not.toBeInTheDocument();

    await selectStage(user, "Rejected");
    expect(rejectionLetterField()).toHaveValue("Thank you for your time.");
  });
});

describe("editing the job's details", () => {
  const editButton = () => screen.getByRole("button", { name: "Edit details" });
  const dialog = () => screen.getByRole("dialog", { name: "Edit job details" });

  it("DET-13: opens on what the job holds, and saves only what changed, shown at once", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(editButton());
    const form = within(dialog());
    expect(form.getByLabelText("Company")).toHaveValue(harvest.company);
    expect(form.getByLabelText("Role title")).toHaveValue(harvest.role);
    expect(form.getByLabelText("Location")).toHaveValue(harvest.location);
    expect(form.getByLabelText("Application link")).toHaveValue(harvest.postingUrl);

    await user.clear(form.getByLabelText("Role title"));
    await user.type(form.getByLabelText("Role title"), "  Design Director ");
    await user.clear(form.getByLabelText("Application link"));
    await user.type(form.getByLabelText("Application link"), "https://harvest.example.com/jobs/9");
    await user.click(form.getByRole("button", { name: "Save details" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editButton()).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Design Director");
    expect(screen.getByRole("link", { name: /Open posting/ })).toHaveAttribute(
      "href",
      "https://harvest.example.com/jobs/9",
    );
    expect(trail.jobs.update).toHaveBeenCalledTimes(1);
    expect(trail.jobs.update).toHaveBeenCalledWith(HARVEST, {
      role: "Design Director",
      postingUrl: "https://harvest.example.com/jobs/9",
    });
  });

  it("DET-13: a cleared location saves as the default, and reads blank when opened again", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(editButton());
    await user.clear(within(dialog()).getByLabelText("Location"));
    await user.click(within(dialog()).getByRole("button", { name: "Save details" }));

    expect(trail.jobs.update).toHaveBeenCalledWith(HARVEST, { location: LOCATION_FALLBACK });
    expect(screen.getByText(`${harvest.company} · ${LOCATION_FALLBACK}`)).toBeInTheDocument();

    await user.click(editButton());
    expect(within(dialog()).getByLabelText("Location")).toHaveValue("");
  });

  it("DET-13: refuses a link that is not a web address in the dialog, and sends nothing", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(editButton());
    const link = within(dialog()).getByLabelText("Application link");
    await user.clear(link);
    await user.type(link, "javascript:alert(1)");
    await user.click(within(dialog()).getByRole("button", { name: "Save details" }));

    expect(dialog()).toBeInTheDocument();
    expect(link).toHaveAttribute("aria-invalid", "true");
    expect(link).toHaveAccessibleDescription("Enter a web address starting with http:// or https://");
    expect(trail.jobs.update).not.toHaveBeenCalled();
  });

  it("DET-13: saving with nothing changed, or cancelling, sends nothing", async () => {
    const { user, trail } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await user.click(editButton());
    await user.click(within(dialog()).getByRole("button", { name: "Save details" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(editButton());
    await user.type(within(dialog()).getByLabelText("Company"), " Group");
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(`${harvest.company} · ${harvest.location}`)).toBeInTheDocument();

    expect(trail.jobs.update).not.toHaveBeenCalled();
  });

  it("DET-13: a refused save rolls back and says why, in the server's own words", async () => {
    const trail = createTrail({ jobs: SEED_JOBS });
    const update = vi.fn<(id: string, patch: JobPatch) => Promise<Job>>().mockRejectedValue(
      new ActionError("invalid", "Check the highlighted fields.", {
        company: "Keep this under 120 characters",
      }),
    );
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { trail, client: { ...trail.jobs, update } });

    await user.click(editButton());
    await user.type(within(dialog()).getByLabelText("Company"), " Group");
    await user.click(within(dialog()).getByRole("button", { name: "Save details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Keep this under 120 characters");
    expect(screen.getByText(`${harvest.company} · ${harvest.location}`)).toBeInTheDocument();
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

describe("the summit attempt", () => {
  const attempt = () => screen.getByRole("list", { name: "Summit attempt" });
  const currentStep = () => within(attempt()).getByText((_, node) => node?.getAttribute("aria-current") === "step");

  it("SUM-1: tells the Stage as a phase of the climb, and follows a Stage change", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    expect(currentStep()).toHaveTextContent("Climb, Interviewing");
    expect(screen.getByText("On the climb.")).toBeInTheDocument();

    await selectStage(user, "Offer");

    expect(currentStep()).toHaveTextContent("Summit, Offer");
    expect(screen.getByText("Summit.")).toBeInTheDocument();
  });

  it("SUM-2: a rejected Job is off the route, regrouping for the next attempt", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />);

    await selectStage(user, "Rejected");

    expect(currentStep()).toHaveTextContent("Regroup, Rejected");
    expect(within(attempt()).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Regroup at camp.")).toBeInTheDocument();
  });

  it("SUM-3: shows the scene for the Job's Stage, hidden from assistive technology, and moves back with a refused change", async () => {
    const trail = createTrail({ jobs: SEED_JOBS });
    let refuse = false;
    const setStage = (id: string, stage: Stage) =>
      refuse ? Promise.reject(new ActionError("failed", "Couldn't move the job.")) : trail.jobs.setStage(id, stage);
    const { user, container } = renderWithJobs(<JobDetail jobId={HARVEST} scenes={<SummitScenes />} />, {
      trail,
      client: { ...trail.jobs, setStage },
    });
    const shown = () => container.querySelector("[data-summit]")?.getAttribute("data-summit");

    const pictures = container.querySelectorAll("svg[data-summit-part]");
    expect([...pictures].map((svg) => svg.getAttribute("data-summit-part"))).toEqual([...STAGES]);
    for (const svg of pictures) expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(shown()).toBe("interviewing");

    await selectStage(user, "Offer");
    expect(shown()).toBe("offer");

    refuse = true;
    await selectStage(user, "Rejected");
    await screen.findByRole("alert");
    expect(shown()).toBe("offer");
  });

  it("SUM-4: draws the scenes it was handed once, however the Job changes", async () => {
    let renders = 0;
    function Scenes() {
      renders += 1;
      return <svg data-testid="scenes" />;
    }
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} scenes={<Scenes />} />);

    await selectStage(user, "Offer");
    await selectStage(user, "Applied");

    expect(screen.getByTestId("scenes")).toBeInTheDocument();
    expect(renders).toBe(1);
  });
});
