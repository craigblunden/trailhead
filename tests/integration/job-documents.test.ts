import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import { setJobDocumentAction } from "@/server/actions/documents";
import { deleteDocument, listDocuments, setJobDocument } from "@/server/data/documents";
import { NotFoundError, RuleError } from "@/server/data/errors";
import { createJob, getJob, updateJob } from "@/server/data/jobs";
import { withTenant } from "@/server/db/tenant";

import { newUserId, resetTables } from "./helpers";

const FROZEN = new Date("2026-07-25T12:00:00Z");

const jobInput = (role: string) => ({
  company: "Fernwood",
  role,
  location: "Remote (US)",
  salaryMin: null,
  salaryMax: null,
  postingUrl: "",
  description: "",
});

/**
 * Documents are created as rows here: attaching reads only the database, so these tests need no
 * Storage. Upload and removal are proven against the real bucket in `documents.test.ts`.
 */
async function documentRow(
  userId: string,
  kind: "resume" | "cover_letter",
  fileName: string,
  overrides: { ingestion?: "pending" | "ready"; deletedAt?: Date } = {},
) {
  return withTenant(userId, (tx) =>
    tx.document.create({
      data: {
        userId,
        kind,
        fileName,
        storageKey: `${userId}/${crypto.randomUUID()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        text: "Sam Rivera, product designer.",
        ingestion: overrides.ingestion ?? "ready",
        deletedAt: overrides.deletedAt ?? null,
      },
    }),
  );
}

beforeEach(async () => {
  await resetTables();
  signOut();
  vi.restoreAllMocks();
});

describe("ticket 17: pick an existing document for a job", () => {
  it("attaches one document to several jobs without re-uploading; detaching one leaves the others", async () => {
    const user = newUserId();
    signInAs(user);
    const resume = await documentRow(user, "resume", "resume_growth_v2.pdf");
    const a = await createJob(jobInput("Product Designer"), FROZEN);
    const b = await createJob(jobInput("Brand Designer"), FROZEN);

    expect((await setJobDocument(a.id, "resume", resume.id)).resume).toEqual({
      id: resume.id,
      fileName: "resume_growth_v2.pdf",
    });
    await setJobDocument(b.id, "resume", resume.id);
    expect((await listDocuments())[0].jobs.map((job) => job.id).sort()).toEqual([a.id, b.id].sort());

    const detached = await setJobDocument(a.id, "resume", null);
    expect(detached.resume).toBeNull();
    expect((await getJob(b.id))?.resume?.id).toBe(resume.id);
    expect((await listDocuments())[0].jobs.map((job) => job.id)).toEqual([b.id]);
  });

  it("a job holds a resume and a cover letter at once, and setting one never detaches the other", async () => {
    const user = newUserId();
    signInAs(user);
    const resume = await documentRow(user, "resume", "resume.pdf");
    const letter = await documentRow(user, "cover_letter", "letter.docx");
    const job = await createJob(jobInput("Product Designer"), FROZEN);

    await setJobDocument(job.id, "resume", resume.id);
    const both = await setJobDocument(job.id, "cover_letter", letter.id);
    expect(both).toMatchObject({
      resume: { id: resume.id, fileName: "resume.pdf" },
      coverLetter: { id: letter.id, fileName: "letter.docx" },
    });

    const withoutLetter = await setJobDocument(job.id, "cover_letter", null);
    expect(withoutLetter.resume?.id).toBe(resume.id);
  });

  it("a cover letter cannot be set as the resume, nor a resume as the cover letter — in the data layer and in Postgres", async () => {
    const user = newUserId();
    signInAs(user);
    const resume = await documentRow(user, "resume", "resume.pdf");
    const letter = await documentRow(user, "cover_letter", "letter.docx");
    const job = await createJob(jobInput("Product Designer"), FROZEN);

    await expect(setJobDocument(job.id, "resume", letter.id)).rejects.toMatchObject({
      code: "wrong-kind",
    });
    await expect(setJobDocument(job.id, "cover_letter", resume.id)).rejects.toBeInstanceOf(RuleError);
    expect(await setJobDocumentAction(job.id, "resume", letter.id)).toMatchObject({
      ok: false,
      error: "rejected",
      code: "wrong-kind",
    });

    // Even a write that skips the data layer is refused by the tenant policy's check.
    await expect(
      withTenant(user, (tx) => tx.job.update({ where: { id: job.id }, data: { resumeId: letter.id } })),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withTenant(user, (tx) => tx.job.update({ where: { id: job.id }, data: { coverLetterId: resume.id } })),
    ).rejects.toThrow(/row-level security/);
    expect(await getJob(job.id)).toMatchObject({ resume: null, coverLetter: null });
  });

  it("only a ready, live document can be attached", async () => {
    const user = newUserId();
    signInAs(user);
    const pending = await documentRow(user, "resume", "uploading.pdf", { ingestion: "pending" });
    const deleted = await documentRow(user, "resume", "gone.pdf", { deletedAt: new Date() });
    const job = await createJob(jobInput("Product Designer"), FROZEN);

    await expect(setJobDocument(job.id, "resume", pending.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobDocument(job.id, "resume", deleted.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("attaching a document the user does not own is impossible", async () => {
    const userA = newUserId();
    signInAs(userA);
    const resumeA = await documentRow(userA, "resume", "a.pdf");
    const jobA = await createJob(jobInput("A's role"), FROZEN);

    const userB = newUserId();
    signInAs(userB);
    const jobB = await createJob(jobInput("B's role"), FROZEN);

    await expect(setJobDocument(jobB.id, "resume", resumeA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobDocument(jobA.id, "resume", null)).rejects.toBeInstanceOf(NotFoundError);
    expect(await setJobDocumentAction(jobB.id, "resume", resumeA.id)).toEqual(
      await setJobDocumentAction(jobB.id, "resume", "does-not-exist"),
    );
    await expect(
      withTenant(userB, (tx) => tx.job.update({ where: { id: jobB.id }, data: { resumeId: resumeA.id } })),
    ).rejects.toThrow(/row-level security/);

    signInAs(userA);
    expect((await listDocuments())[0].jobs).toEqual([]);
  });

  it("an attach racing a delete never leaves a job pointing at a deleted document, or uneditable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    signInAs(user);
    const job = await createJob(jobInput("Product Designer"), FROZEN);

    for (let round = 0; round < 25; round += 1) {
      const resume = await documentRow(user, "resume", `resume-${round}.pdf`);
      await Promise.allSettled([setJobDocument(job.id, "resume", resume.id), deleteDocument(resume.id)]);

      const row = await withTenant(user, (tx) =>
        tx.job.findFirst({ where: { id: job.id }, select: { resume: { select: { deletedAt: true } } } }),
      );
      expect(row?.resume?.deletedAt ?? null, `round ${round}`).toBeNull();
      await expect(updateJob(job.id, { notes: `round ${round}` }), `round ${round}`).resolves.toBeTruthy();
    }
  });

  it("deleting a cover letter detaches it and leaves the job's resume", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = newUserId();
    signInAs(user);
    const resume = await documentRow(user, "resume", "resume.pdf");
    const letter = await documentRow(user, "cover_letter", "letter.docx");
    const job = await createJob(jobInput("Product Designer"), FROZEN);
    await setJobDocument(job.id, "resume", resume.id);
    await setJobDocument(job.id, "cover_letter", letter.id);

    // No Storage here, so the object removal fails and the tombstone waits for the sweep — the
    // detach has already happened in the tombstone's own transaction.
    await deleteDocument(letter.id);

    expect(await getJob(job.id)).toMatchObject({ resume: { id: resume.id }, coverLetter: null });
  });
});
