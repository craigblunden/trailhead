import { describe, expect, it } from "vitest";

import { SEED_JOBS } from "../fixtures/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import { prefetchJobs } from "@/server/prefetch";

describe("prefetchJobs (tickets 09, 12)", () => {
  it("PRE-1: dehydrates the list under the shared key when the read succeeds", async () => {
    const state = await prefetchJobs(async () => SEED_JOBS);

    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].queryKey).toEqual(jobsCache.key);
    expect(state.queries[0].state.data).toEqual(SEED_JOBS);
  });

  it("PRE-2: a database outage during render does not crash the page — the client retries and shows its error state", async () => {
    const state = await prefetchJobs(async () => {
      throw new Error("Can't reach database server");
    });

    // Nothing is dehydrated for a failed query, so the browser fetches through the action, gets
    // the same failure as a result, and renders the designed error state (see BoardView).
    expect(state.queries).toEqual([]);
  });
});
