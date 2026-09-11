import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardView } from "@/components/board/board-view";
import { JobDetail } from "@/components/job/job-detail";
import { getQueryClient } from "@/components/providers";
import { SEED_JOBS } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import { createFixtureJobsClient, type JobsClient } from "@/lib/jobs-client";
import { freezeClock, renderWithJobs, screen, waitFor, within } from "../test-utils";

const HARVEST = "harvest-lead-product-designer";

/**
 * A client whose writes all fail — after a beat, the way a real server does, so the optimistic
 * state is on screen long enough to be seen (and asserted) before it is rolled back.
 */
function rejectingClient(): JobsClient {
  const fixture = createFixtureJobsClient(SEED_JOBS);
  const reject = () =>
    new Promise<never>((_, fail) =>
      setTimeout(() => fail(new Error("503 from the server")), 150),
    );
  return { list: fixture.list, add: reject, update: reject, setStage: reject };
}

async function selectStage(user: ReturnType<typeof renderWithJobs>["user"], stage: string) {
  await user.click(screen.getByRole("combobox", { name: "Application stage" }));
  await user.click(await screen.findByRole("option", { name: stage }));
}

beforeEach(() => {
  freezeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("query identity", () => {
  it("TSQ-1: the query key is defined once, for the server prefetch and the client read alike", () => {
    expect(jobsCache.key).toEqual(["jobs"]);
    expect(jobsCache.options(async () => []).queryKey).toBe(jobsCache.key);
  });

  it("TSQ-2: staleTime is greater than zero, so hydrated data is not thrown away on mount", () => {
    // With the default of 0, the client refetches immediately after hydration and discards
    // everything the server streamed. See the comment in `jobsCache`.
    expect(jobsCache.staleTime).toBeGreaterThan(0);
    expect(jobsCache.options(async () => []).staleTime).toBe(jobsCache.staleTime);
  });

  it("TSQ-3: the browser reuses one QueryClient across calls", () => {
    // Under jsdom `window` exists, so this is the browser branch. The server branch returns a
    // fresh client per call so one request's cache can never leak into another's render.
    expect(getQueryClient()).toBe(getQueryClient());
  });
});

describe("rollback", () => {
  it("TSQ-4: a rejected stage change reverts visibly and reports a non-blocking error", async () => {
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, {
      client: rejectingClient(),
    });
    const combobox = () => screen.getByRole("combobox", { name: "Application stage" });
    expect(combobox()).toHaveTextContent("Interviewing");

    await selectStage(user, "Offer");

    // The optimistic path shows the change first…
    expect(combobox()).toHaveTextContent("Offer");
    // …then the server says no, and the board reverts where the user can see it.
    await waitFor(() => expect(combobox()).toHaveTextContent("Interviewing"));
    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).queryByText("Moved to Offer")).toBeNull();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/wasn't saved/);
    // Non-blocking: the page is still usable and the error can be dismissed.
    expect(combobox()).toBeEnabled();
    await user.click(within(alert).getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("TSQ-4: a rejected add removes the optimistic card from the board", async () => {
    const { user } = renderWithJobs(<BoardView />, { client: rejectingClient() });

    await user.click(screen.getByRole("button", { name: /add job/i }));
    const dialog = screen.getByRole("dialog", { name: "Add a job" });
    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    expect(screen.getByRole("link", { name: "Principal Designer" })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Principal Designer" })).toBeNull(),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't saved/);
  });

  it("TSQ-5: a successful add replaces the optimistic card with what the server returned", async () => {
    const fixture = createFixtureJobsClient(SEED_JOBS);
    const client: JobsClient = {
      ...fixture,
      add: async (input) => ({ ...(await fixture.add(input)), id: "server-assigned-id" }),
    };
    const { user } = renderWithJobs(<BoardView />, { client });

    await user.click(screen.getByRole("button", { name: /add job/i }));
    const dialog = screen.getByRole("dialog", { name: "Add a job" });
    await user.type(within(dialog).getByLabelText("Company"), "Alpine Robotics");
    await user.type(within(dialog).getByLabelText("Role title"), "Principal Designer");
    await user.click(within(dialog).getByRole("button", { name: "Add to board" }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Principal Designer" })).toHaveAttribute(
        "href",
        "/board/server-assigned-id",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("loading and failure", () => {
  it("TSQ-6: shows a loading state while the list is in flight, then the board", async () => {
    let resolve!: (jobs: typeof SEED_JOBS) => void;
    const client: JobsClient = {
      ...createFixtureJobsClient(SEED_JOBS),
      list: () => new Promise((r) => (resolve = r)),
    };
    renderWithJobs(<BoardView />, { client, seedCache: false });

    expect(await screen.findByRole("status")).toHaveTextContent(/loading/i);

    resolve(SEED_JOBS);
    expect(await screen.findByRole("region", { name: "Interested" })).toBeInTheDocument();
  });

  it("TSQ-7: a failed list renders a designed error state with a way to retry", async () => {
    let attempts = 0;
    const client: JobsClient = {
      ...createFixtureJobsClient(SEED_JOBS),
      list: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("database unreachable");
        return SEED_JOBS;
      },
    };
    const { user } = renderWithJobs(<BoardView />, { client, seedCache: false });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn.t load/i);

    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("region", { name: "Interested" })).toBeInTheDocument();
  });
});
