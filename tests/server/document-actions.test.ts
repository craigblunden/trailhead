import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDocumentAction, startUploadAction } from "@/server/actions/documents";

/**
 * Performance ticket 03: the document actions answer without waiting on Storage cleanup. The data
 * layer is stubbed to hand its cleanup to whatever the action gives it; `after()` is stubbed to hold
 * the work, as Next does until the response has been sent.
 */
const dataLayer = vi.hoisted(() => ({
  deleteDocument: vi.fn(),
  documentDownloadUrl: vi.fn(),
  finishUpload: vi.fn(),
  listDocuments: vi.fn(),
  setJobDocument: vi.fn(),
  startUpload: vi.fn(),
}));

vi.mock("@/server/data/documents", () => dataLayer);

const scheduled = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    scheduled.push(task);
  },
}));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getOptionalSession: async () => ({ userId: "6a0c2e20-0000-4000-8000-000000000001", email: "t@example.com", name: "T" }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  scheduled.length = 0;
});

describe("document actions defer their Storage cleanup (performance ticket 03)", () => {
  it("a delete answers before its cleanup runs; the cleanup runs after the response", async () => {
    const cleanup = vi.fn(async () => {});
    dataLayer.deleteDocument.mockImplementation(async (_id: string, defer: (work: () => Promise<unknown>) => unknown) => {
      await defer(cleanup);
    });

    expect(await deleteDocumentAction("document-1")).toEqual({ ok: true, data: null });
    expect(cleanup).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("starting an upload answers with its ticket before the cleanup runs", async () => {
    const ticket = { documentId: "document-2", path: "p", token: "t", contentType: "application/pdf" };
    const cleanup = vi.fn(async () => {});
    dataLayer.startUpload.mockImplementation(async (_input: unknown, defer: (work: () => Promise<unknown>) => unknown) => {
      await defer(cleanup);
      return ticket;
    });

    expect(await startUploadAction({ kind: "resume", fileName: "resume.pdf", sizeBytes: 1024 })).toEqual({
      ok: true,
      data: ticket,
    });
    expect(cleanup).not.toHaveBeenCalled();
    await scheduled[0]();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("a cleanup that fails after the response is logged with its operation, never thrown", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    dataLayer.deleteDocument.mockImplementation(async (_id: string, defer: (work: () => Promise<unknown>) => unknown) => {
      await defer(async () => {
        throw new Error("Storage is unreachable");
      });
    });

    await deleteDocumentAction("document-3");
    await expect(Promise.resolve(scheduled[0]())).resolves.not.toThrow();
    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0][0])).toContain("documents.delete.cleanup");
    logged.mockRestore();
  });
});
