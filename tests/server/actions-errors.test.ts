import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJobAction, listJobsAction, updateJobAction } from "@/server/actions/jobs";
import { NotFoundError } from "@/server/data/errors";

/**
 * The action layer's error handling, with the data layer replaced by a stub that throws what we
 * tell it to. Nothing internal — no Prisma text, no stack, no constraint — may reach the client.
 */
const dataLayer = vi.hoisted(() => ({
  listJobs: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  setJobStage: vi.fn(),
}));

vi.mock("@/server/data/jobs", () => dataLayer);

const session = vi.hoisted(() => ({ userId: "6a0c2e20-0000-4000-8000-000000000001" as string | null }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () =>
      session.userId ? { userId: session.userId, email: "t@example.com", name: "T" } : null,
  };
});

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("actions under failure (ticket 12)", () => {
  it("ERR-1: a database outage becomes a generic 'failed' result, and the details go to the log", async () => {
    const outage = Object.assign(new Error("Can't reach database server at `127.0.0.1:54329`"), {
      name: "PrismaClientInitializationError",
      clientVersion: "7.10.0",
    });
    dataLayer.listJobs.mockRejectedValueOnce(outage);

    const result = await listJobsAction();

    expect(result).toEqual({
      ok: false,
      error: "failed",
      message: expect.stringMatching(/went wrong on our side/),
    });
    expect(JSON.stringify(result)).not.toMatch(/prisma|54329|database/i);

    expect(logged).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logged.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      operation: "jobs.list",
      tenant: "6a0c2e20-0000-4000-8000-000000000001",
      error: { name: "PrismaClientInitializationError" },
    });
  });

  it("ERR-2: a not-found from the data layer is the same result for a missing and a foreign id", async () => {
    dataLayer.updateJob.mockRejectedValue(new NotFoundError());

    const missing = await updateJobAction("does-not-exist", { notes: "x" });
    const foreign = await updateJobAction("someone-elses-id", { notes: "x" });

    expect(missing).toEqual(foreign);
    expect(missing).toMatchObject({ ok: false, error: "not-found" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("ERR-3: an ended session is a re-authentication result, not a redirect and not a crash", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    dataLayer.createJob.mockRejectedValueOnce(new UnauthenticatedError());
    session.userId = null;

    const result = await createJobAction({ company: "A", role: "B" });

    expect(result).toMatchObject({ ok: false, error: "unauthenticated" });
    expect(logged).not.toHaveBeenCalled();
    session.userId = "6a0c2e20-0000-4000-8000-000000000001";
  });

  it("ERR-4: a thrown non-Error is handled and logged as unknown", async () => {
    dataLayer.listJobs.mockRejectedValueOnce("string thrown");

    const result = await listJobsAction();

    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(JSON.parse(logged.mock.calls[0][0] as string).error.name).toBe("UnknownError");
  });
});
