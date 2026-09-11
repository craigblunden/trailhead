import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signOut } from "./session-mock";

import { DOCUMENT_CAP, DOWNLOAD_URL_TTL_SECONDS } from "@/lib/documents";
import {
  deleteDocumentAction,
  documentLinkAction,
  finishUploadAction,
  startUploadAction,
} from "@/server/actions/documents";
import {
  ABANDONED_UPLOAD_MS,
  deleteDocument,
  documentDownloadUrl,
  finishUpload,
  listDocuments,
  startUpload,
  sweepMyDocuments,
} from "@/server/data/documents";
import { NotFoundError, RuleError } from "@/server/data/errors";
import { withTenant } from "@/server/db/tenant";

import { resetTables } from "./helpers";
import {
  actAs,
  asJanitor,
  bucketOf,
  emptyFolder,
  fixture,
  objectExists,
  putObject,
  realUser,
  type RealUser,
} from "./storage-helpers";

/**
 * A pass-through over the real bucket, with two hooks: one that runs just before an upload URL is
 * minted, and one that makes the next object removal fail as if Storage were unreachable.
 */
const hooks = vi.hoisted(() => ({
  beforeSign: null as null | ((key: string) => Promise<void>),
  failNextRemove: false,
}));

vi.mock("@/server/storage/documents-bucket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/storage/documents-bucket")>();
  return {
    ...actual,
    documentsBucket: async () => {
      const bucket = await actual.documentsBucket();
      return new Proxy(bucket, {
        get(target, property) {
          if (property === "createSignedUploadUrl") {
            return async (key: string) => {
              await hooks.beforeSign?.(key);
              return target.createSignedUploadUrl(key);
            };
          }
          if (property === "remove" && hooks.failNextRemove) {
            hooks.failNextRemove = false;
            return async () => ({ data: null, error: new Error("Storage is unreachable") });
          }
          const value = Reflect.get(target, property) as unknown;
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
    },
  };
});

let alice: RealUser;
let bob: RealUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([realUser(), realUser()]);
}, 60_000);

beforeEach(async () => {
  await resetTables();
  signOut();
  hooks.beforeSign = null;
  hooks.failNextRemove = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([emptyFolder(alice), emptyFolder(bob)]);
});

afterAll(async () => {
  await resetTables();
});

/** The full upload as the browser drives it: start, PUT to Storage, finish. */
async function upload(user: RealUser, name: string, kind: "resume" | "cover_letter" = "resume") {
  actAs(user);
  const bytes = fixture(name);
  const ticket = await startUpload({ kind, fileName: name, sizeBytes: bytes.length });
  const put = await putObject(user, ticket, bytes);
  expect(put.error, "the browser's PUT").toBeNull();
  return { ticket, summary: await finishUpload(ticket.documentId) };
}

async function storedRow(user: RealUser, id: string) {
  return withTenant(user.userId, (tx) => tx.document.findFirst({ where: { id } }));
}

describe("ticket 15: upload a resume", () => {
  it("uploads a PDF and a DOCX; both appear in the user's documents with their text extracted", async () => {
    const pdf = await upload(alice, "resume.pdf");
    const docx = await upload(alice, "resume.docx", "cover_letter");

    const listed = await listDocuments();
    expect(listed.map((d) => [d.fileName, d.kind, d.status])).toEqual([
      ["resume.docx", "cover_letter", "ready"],
      ["resume.pdf", "resume", "ready"],
    ]);
    for (const { summary } of [pdf, docx]) {
      const row = await storedRow(alice, summary.id);
      expect(row?.text).toContain("Sam Rivera - Senior Product Designer");
      expect(row?.ingestion).toBe("ready");
      expect(row?.storageKey.startsWith(`${alice.userId}/`)).toBe(true);
      expect(row?.storageKey).not.toContain("resume");
    }
  });

  it("creates the row before the object can exist, and an abandoned upload leaves only a pending row", async () => {
    actAs(alice);
    let rowAtSigning: unknown = "not checked";
    hooks.beforeSign = async (key) => {
      rowAtSigning = await withTenant(alice.userId, (tx) =>
        tx.document.findFirst({ where: { storageKey: key }, select: { ingestion: true } }),
      );
      expect(await objectExists(alice, key)).toBe(false);
    };

    const ticket = await startUpload({ kind: "resume", fileName: "resume.pdf", sizeBytes: 1024 });

    expect(rowAtSigning).toEqual({ ingestion: "pending" });
    // The browser never uploads. No object exists, and the database knows exactly what is missing.
    const row = await storedRow(alice, ticket.documentId);
    expect(row).toMatchObject({ ingestion: "pending", deletedAt: null });
    expect(await objectExists(alice, row!.storageKey)).toBe(false);
    expect((await bucketOf(alice).list(alice.userId)).data).toEqual([]);
  });

  it("refuses an oversize or disallowed file before a row exists, and the bucket refuses them too", async () => {
    actAs(alice);
    const tooLarge = await startUploadAction({ kind: "resume", fileName: "cv.pdf", sizeBytes: 6 * 1024 * 1024 });
    expect(tooLarge).toMatchObject({ ok: false, error: "invalid" });
    if (!tooLarge.ok) expect(tooLarge.fields?.sizeBytes).toMatch(/5 MB/);

    const wrongType = await startUploadAction({ kind: "resume", fileName: "cv.png", sizeBytes: 100 });
    expect(wrongType).toMatchObject({ ok: false, error: "invalid" });
    if (!wrongType.ok) expect(wrongType.fields?.fileName).toMatch(/PDF or a Word document/);
    expect(await listDocuments()).toEqual([]);

    // A browser that lies about the size still meets the bucket's own limit.
    const ticket = await startUpload({ kind: "resume", fileName: "big.pdf", sizeBytes: 1024 });
    const oversize = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(6 * 1024 * 1024, 32)]);
    const put = await putObject(alice, ticket, oversize);
    expect(put.error).not.toBeNull();
    const refusedType = await putObject(alice, { ...ticket, contentType: "text/plain" }, fixture("resume.pdf"));
    expect(refusedType.error).not.toBeNull();
  });

  it("expresses the cap as a rule: the fourth upload is refused, even when two race for the last slot", async () => {
    expect(DOCUMENT_CAP).toBe(3);
    await upload(alice, "resume.pdf");
    actAs(alice);
    const racing = await Promise.allSettled([
      startUpload({ kind: "resume", fileName: "a.pdf", sizeBytes: 1024 }),
      startUpload({ kind: "resume", fileName: "b.pdf", sizeBytes: 1024 }),
      startUpload({ kind: "resume", fileName: "c.pdf", sizeBytes: 1024 }),
    ]);
    expect(racing.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const refused = racing.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(RuleError);
    expect(refused.reason).toMatchObject({ code: "cap-reached" });

    const fourth = await startUploadAction({ kind: "resume", fileName: "d.pdf", sizeBytes: 1024 });
    expect(fourth).toMatchObject({ ok: false, error: "rejected", code: "cap-reached" });
    if (!fourth.ok) expect(fourth.message).toMatch(/All 3 slots are used/);
  });

  it("mints signed download URLs per view, living 300 seconds or less", async () => {
    const { summary } = await upload(alice, "resume.pdf");

    const url = await documentDownloadUrl(summary.id);
    const token = new URL(url).searchParams.get("token")!;
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(claims.exp - claims.iat).toBe(DOWNLOAD_URL_TTL_SECONDS);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);

    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture("resume.pdf"));
  });

  it("the bucket is private and there is no UPDATE policy on storage objects", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    const row = await storedRow(alice, summary.id);

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${row!.storageKey}`;
    expect((await fetch(publicUrl)).status).not.toBe(200);

    const policies = await asJanitor((client) =>
      client.query<{ policyname: string; cmd: string }>(
        "select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents_%'",
      ),
    );
    expect(policies.rows.map((p) => p.cmd).sort()).toEqual(["DELETE", "INSERT", "SELECT"]);
  });

  it("user B cannot list, download, sign a URL for, or remove user A's object", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    const key = (await storedRow(alice, summary.id))!.storageKey;

    // Straight at Storage with B's own session, bypassing the application entirely.
    const asBob = bucketOf(bob);
    expect((await asBob.list(alice.userId)).data ?? []).toEqual([]);
    expect((await asBob.download(key)).error).not.toBeNull();
    expect((await asBob.createSignedUrl(key, 60)).error).not.toBeNull();
    await asBob.remove([key]);
    expect(await objectExists(alice, key)).toBe(true);
    const intoAlicesFolder = await asBob.createSignedUploadUrl(`${alice.userId}/evil.pdf`);
    expect(intoAlicesFolder.error).not.toBeNull();

    // And through the application, as B.
    actAs(bob);
    expect(await listDocuments()).toEqual([]);
    await expect(documentDownloadUrl(summary.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(finishUpload(summary.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await documentLinkAction(summary.id)).toEqual(await documentLinkAction("does-not-exist"));
  });

  it("asks for re-authentication when there is no session", async () => {
    signOut();
    expect(await startUploadAction({ kind: "resume", fileName: "a.pdf", sizeBytes: 10 })).toMatchObject({
      ok: false,
      error: "unauthenticated",
    });
  });
});

describe("ticket 19: an upload that cannot be used has one owner — the delete path", () => {
  it("a PDF with no text layer is refused at upload: its object is removed and it leaves the list", async () => {
    actAs(alice);
    const bytes = fixture("scan.pdf");
    const ticket = await startUpload({ kind: "resume", fileName: "scan.pdf", sizeBytes: bytes.length });
    await putObject(alice, ticket, bytes);
    const key = (await storedRow(alice, ticket.documentId))!.storageKey;

    const result = await finishUploadAction(ticket.documentId);

    expect(result).toMatchObject({ ok: false, error: "rejected", code: "no-text-layer" });
    if (!result.ok) expect(result.message).toMatch(/no text in it/);
    // The refusal carries a written message and nothing internal: no key, no user id, no parser text.
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(alice.userId);
    expect(JSON.stringify(result)).not.toMatch(/pdf\.js|unpdf|mammoth|stack/i);
    // Tombstoned, not forgotten, while its upload URL could still be used (see finishDeleting).
    expect(await storedRow(alice, ticket.documentId)).toMatchObject({
      ingestion: "failed",
      ingestionError: "no-text-layer",
    });
    expect((await storedRow(alice, ticket.documentId))?.deletedAt).toBeInstanceOf(Date);
    expect(await objectExists(alice, key)).toBe(false);
    expect(await listDocuments()).toEqual([]);
  });

  it("finishing an upload whose object never arrived is refused and cleaned up", async () => {
    actAs(alice);
    const ticket = await startUpload({ kind: "resume", fileName: "resume.pdf", sizeBytes: 1024 });

    expect(await finishUploadAction(ticket.documentId)).toMatchObject({ code: "upload-missing" });
    expect((await storedRow(alice, ticket.documentId))?.deletedAt).toBeInstanceOf(Date);
    expect(await listDocuments()).toEqual([]);
    const afterTheUrlExpires = new Date(Date.now() + ABANDONED_UPLOAD_MS + 60_000);
    expect(await sweepMyDocuments(afterTheUrlExpires)).toEqual({ deleted: 1 });
  });

  for (const [name, code, words] of [
    ["locked.pdf", "password-protected", /password-protected/],
    ["locked.docx", "password-protected", /password-protected/],
    ["pdf-named-as.docx", "type-mismatch", /the kind its name says/],
  ] as const) {
    it(`${name}, a real file of its kind, is refused with the message for ${code}`, async () => {
      actAs(alice);
      const bytes = fixture(name);
      const ticket = await startUpload({ kind: "resume", fileName: name, sizeBytes: bytes.length });
      expect((await putObject(alice, ticket, bytes)).error).toBeNull();
      const key = (await storedRow(alice, ticket.documentId))!.storageKey;

      const result = await finishUploadAction(ticket.documentId);

      expect(result).toMatchObject({ ok: false, error: "rejected", code });
      if (!result.ok) expect(result.message).toMatch(words);
      expect(await objectExists(alice, key)).toBe(false);
      expect(await listDocuments()).toEqual([]);
    });
  }

  it("a late upload through the URL of a deleted pending document is still reclaimed", async () => {
    actAs(alice);
    const ticket = await startUpload({ kind: "resume", fileName: "resume.pdf", sizeBytes: 1024 });
    await deleteDocument(ticket.documentId);
    expect(await listDocuments()).toEqual([]);

    // The browser was slow: its upload lands after the delete, through the still-valid URL.
    expect((await putObject(alice, ticket, fixture("resume.pdf"))).error).toBeNull();
    const key = (await storedRow(alice, ticket.documentId))!.storageKey;
    expect(await objectExists(alice, key)).toBe(true);

    // The tombstone kept the key known, so the next sweep removes the object; once the URL has
    // expired, the row goes too.
    expect(await sweepMyDocuments()).toEqual({ deleted: 0 });
    expect(await objectExists(alice, key)).toBe(false);
    const afterTheUrlExpires = new Date(Date.now() + ABANDONED_UPLOAD_MS + 60_000);
    expect(await sweepMyDocuments(afterTheUrlExpires)).toEqual({ deleted: 1 });
    expect(await storedRow(alice, ticket.documentId)).toBeNull();
  });
});

describe("ticket 16: delete a document", () => {
  it("leaves the list at once, and the object is gone — signing a URL for it fails afterwards", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    const key = (await storedRow(alice, summary.id))!.storageKey;

    const result = await deleteDocumentAction(summary.id);

    expect(result).toEqual({ ok: true, data: null });
    expect(await listDocuments()).toEqual([]);
    expect((await bucketOf(alice).createSignedUrl(key, 60)).error).not.toBeNull();
    // Tombstoned until its upload URL expires (see finishDeleting).
    expect((await storedRow(alice, summary.id))?.deletedAt).toBeInstanceOf(Date);
  });

  it("a delete interrupted after the tombstone is finished by the sweep, and the sweep is idempotent", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    const key = (await storedRow(alice, summary.id))!.storageKey;

    hooks.failNextRemove = true;
    await deleteDocument(summary.id);

    // Interrupted: gone from the user's view, tombstoned, and the object still in the bucket.
    expect(await listDocuments()).toEqual([]);
    expect((await storedRow(alice, summary.id))?.deletedAt).toBeInstanceOf(Date);
    expect(await objectExists(alice, key)).toBe(true);

    expect(await sweepMyDocuments()).toEqual({ deleted: 0 });
    expect(await objectExists(alice, key)).toBe(false);
    const afterTheUrlExpires = new Date(Date.now() + ABANDONED_UPLOAD_MS + 60_000);
    expect(await sweepMyDocuments(afterTheUrlExpires)).toEqual({ deleted: 1 });
    expect(await storedRow(alice, summary.id)).toBeNull();

    expect(await sweepMyDocuments(afterTheUrlExpires)).toEqual({ deleted: 0 });
  });

  it("the sweep reclaims an abandoned upload, whether or not its object arrived", async () => {
    actAs(alice);
    const arrived = await startUpload({ kind: "resume", fileName: "resume.pdf", sizeBytes: 1024 });
    await putObject(alice, arrived, fixture("resume.pdf"));
    const neverArrived = await startUpload({ kind: "resume", fileName: "other.pdf", sizeBytes: 1024 });
    const arrivedKey = (await storedRow(alice, arrived.documentId))!.storageKey;

    const later = new Date(Date.now() + ABANDONED_UPLOAD_MS + 60_000);
    expect(await sweepMyDocuments(later)).toEqual({ deleted: 2 });

    expect(await objectExists(alice, arrivedKey)).toBe(false);
    expect(await storedRow(alice, arrived.documentId)).toBeNull();
    expect(await storedRow(alice, neverArrived.documentId)).toBeNull();
  });

  it("pg_cron's janitor finishes rows whose object is gone, tombstones abandoned uploads, and is idempotent", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    actAs(alice);
    const abandoned = await startUpload({ kind: "resume", fileName: "never.pdf", sizeBytes: 1024 });
    const inFlight = await startUpload({ kind: "resume", fileName: "now.pdf", sizeBytes: 1024 });

    // A tombstone whose object was already removed, as if the request died just before the row.
    const key = (await storedRow(alice, summary.id))!.storageKey;
    await bucketOf(alice).remove([key]);
    await withTenant(alice.userId, (tx) =>
      tx.document.update({
        where: { id: summary.id },
        data: { deletedAt: new Date(), createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      }),
    );
    // Age the abandoned upload. (The janitor itself may only set `deletedAt`; see the migration.)
    await withTenant(alice.userId, (tx) =>
      tx.document.update({
        where: { id: abandoned.documentId },
        data: { createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      }),
    );

    const first = await asJanitor((client) => client.query("select public.sweep_documents() as n"));
    const second = await asJanitor((client) => client.query("select public.sweep_documents() as n"));

    // The finished tombstone, and the abandoned upload that never had an object.
    expect(first.rows[0].n).toBe(2);
    expect(second.rows[0].n).toBe(0);
    expect(await storedRow(alice, summary.id)).toBeNull();
    expect(await storedRow(alice, abandoned.documentId)).toBeNull();
    // An upload started moments ago is left alone.
    expect(await storedRow(alice, inFlight.documentId)).toMatchObject({ deletedAt: null });

    const job = await asJanitor((client) =>
      client.query("select schedule, command from cron.job where jobname = 'trailhead-sweep-documents'"),
    );
    expect(job.rows[0].schedule).toBe("*/15 * * * *");
    expect(job.rows[0].command).toContain("public.sweep_documents()");
  });

  it("deleting a document a job references leaves the job intact, with the reference cleared", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    actAs(alice);
    const job = await withTenant(alice.userId, (tx) =>
      tx.job.create({
        data: {
          userId: alice.userId,
          company: "Fernwood",
          role: "Product Designer",
          location: "Remote",
          addedOn: new Date("2026-07-25"),
          accent: "moss",
          resumeId: summary.id,
        },
      }),
    );
    expect((await listDocuments())[0].jobs).toEqual([
      { id: job.id, company: "Fernwood", role: "Product Designer" },
    ]);

    await deleteDocument(summary.id);

    const after = await withTenant(alice.userId, (tx) => tx.job.findFirst({ where: { id: job.id } }));
    expect(after).toMatchObject({ company: "Fernwood", resumeId: null });
  });

  it("a late re-upload through the URL of a deleted ready document is still reclaimed", async () => {
    const { ticket, summary } = await upload(alice, "resume.pdf");
    const key = (await storedRow(alice, summary.id))!.storageKey;

    await deleteDocument(summary.id);
    expect(await listDocuments()).toEqual([]);
    expect(await objectExists(alice, key)).toBe(false);

    // The upload URL has not expired: the same token puts a file back under the same key.
    expect((await putObject(alice, ticket, fixture("resume.pdf"))).error).toBeNull();
    expect(await objectExists(alice, key)).toBe(true);

    // So the tombstone must still be there to find it.
    expect((await storedRow(alice, summary.id))?.deletedAt).toBeInstanceOf(Date);
    expect(await sweepMyDocuments()).toEqual({ deleted: 0 });
    expect(await objectExists(alice, key)).toBe(false);
    const afterTheUrlExpires = new Date(Date.now() + ABANDONED_UPLOAD_MS + 60_000);
    expect(await sweepMyDocuments(afterTheUrlExpires)).toEqual({ deleted: 1 });
    expect(await storedRow(alice, summary.id)).toBeNull();
  });

  it("user B cannot delete user A's document", async () => {
    const { summary } = await upload(alice, "resume.pdf");
    const key = (await storedRow(alice, summary.id))!.storageKey;

    actAs(bob);
    await expect(deleteDocument(summary.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await deleteDocumentAction(summary.id)).toEqual(await deleteDocumentAction("nope"));

    actAs(alice);
    expect((await listDocuments()).map((d) => d.id)).toEqual([summary.id]);
    expect(await objectExists(alice, key)).toBe(true);
  });
});
