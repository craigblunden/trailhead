import { afterEach, describe, expect, it, vi } from "vitest";

import { describeError, logError, redact } from "@/server/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logError (ticket 12)", () => {
  it("LOG-1: writes one JSON line with the operation, the tenant, and the error's name and message", () => {
    const line = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connect ECONNREFUSED 127.0.0.1:54329");

    logError({ operation: "jobs.list", tenant: "6a0c2e20-0000-4000-8000-000000000001" }, error);

    expect(line).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(line.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({
      level: "error",
      operation: "jobs.list",
      tenant: "6a0c2e20-0000-4000-8000-000000000001",
      error: { name: "Error", message: "connect ECONNREFUSED 127.0.0.1:54329" },
    });
  });

  it("LOG-2: never logs a session token, a password, or a full user record", () => {
    const line = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "eyJhbGciOiJIUzI1NiJ9.super-secret-token";

    logError(
      {
        operation: "auth.signIn",
        tenant: "6a0c2e20-0000-4000-8000-000000000001",
        // Anything a careless caller might add is scrubbed by key.
        ...({ accessToken: secret, password: "hunter22", authorization: `Bearer ${secret}` } as object),
      },
      new Error("boom"),
    );

    const written = line.mock.calls[0][0] as string;
    expect(written).not.toContain(secret);
    expect(written).not.toContain("hunter22");
    expect(written).toContain("[redacted]");
  });

  it("LOG-3: the raw error object is never serialised — no stack, no query parameters", () => {
    const line = vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaLike = Object.assign(new Error("Invalid `prisma.job.create()` invocation"), {
      clientVersion: "7.10.0",
      meta: { target: ["Job_userId_createdAt_idx"], params: ["sam@example.com", "hunter22"] },
    });

    logError({ operation: "jobs.create" }, prismaLike);

    const written = line.mock.calls[0][0] as string;
    expect(written).not.toContain("hunter22");
    expect(written).not.toContain("Job_userId_createdAt_idx");
    expect(written).not.toContain("at ");
    expect(JSON.parse(written).error).toEqual({
      name: "Error",
      message: "Invalid `prisma.job.create()` invocation",
    });
  });

  it("LOG-4: describes a non-Error throw without crashing", () => {
    expect(describeError("string thrown")).toEqual({ name: "UnknownError", message: "string thrown" });
    expect(redact({ operation: "x", cookie: "abc", tenant: null })).toEqual({
      operation: "x",
      cookie: "[redacted]",
      tenant: null,
    });
  });
});
