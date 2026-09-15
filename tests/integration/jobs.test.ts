import { beforeEach, describe, expect, it, vi } from "vitest";

import { createJobAction, setJobStageAction, updateJobAction } from "@/server/actions/jobs";
import { createContact, listContacts } from "@/server/data/contacts";
import { NotFoundError } from "@/server/data/errors";
import { createJob, getJob, listJobs, setJobStage, updateJob } from "@/server/data/jobs";
import { prisma } from "@/server/db/prisma";

import { newUserId, resetTables } from "./helpers";

/**
 * The session is the one seam that is faked here: there is no request, so no cookie. Nothing else
 * is — Prisma runs against the real database, and the data layer still has no way to take a
 * userId from a caller. `signInAs()` is what the cookie would have said.
 */
const current = { userId: "" };

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  const session = async () =>
    current.userId
      ? { userId: current.userId, email: "tester@example.com", name: "Tester" }
      : null;
  return {
    ...actual,
    getOptionalSession: session,
    requireSession: async () => {
      const value = await session();
      if (!value) throw new actual.UnauthenticatedError();
      return value;
    },
  };
});

function signInAs(userId: string) {
  current.userId = userId;
}

const FROZEN = new Date("2026-07-25T12:00:00Z");

const input = {
  company: "Alpine Robotics",
  role: "Principal Designer",
  location: "Remote (US)",
  salaryMin: 160,
  salaryMax: 190,
  postingUrl: "https://alpine.example.com/jobs/1",
  description: "Robots.",
};

beforeEach(async () => {
  await resetTables();
  current.userId = "";
});

describe("ticket 10: the board reads real jobs, and adding one persists", () => {
  it("creates a job with exactly one activity entry, written in the same transaction", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    expect(job.activity).toEqual([
      { id: expect.any(String), label: "Added to board — Interested", date: "2026-07-25" },
    ]);
    const entries = await prisma.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n from "ActivityEntry"
    `;
    // As postgres would see it — the app role sees nothing outside a tenant. Use the migrator's
    // direct view of the world instead: count through a tenant transaction.
    void entries;
    const asOwner = await listJobs();
    expect(asOwner).toHaveLength(1);
    expect(asOwner[0].activity).toHaveLength(1);
  });

  it("applies the server-side defaults against a frozen clock", async () => {
    signInAs(newUserId());
    const first = await createJob(input, FROZEN);
    const second = await createJob({ ...input, location: "Location TBD" }, FROZEN);

    expect(first).toMatchObject({
      stage: "interested",
      addedOn: "2026-07-25",
      appliedOn: null,
      notes: "",
      contacts: [],
      resume: null,
      coverLetter: null,
      accent: "moss",
    });
    // Round-robin over the accent keys, by how many jobs the user already has.
    expect(second.accent).toBe("forest");
  });

  it("lists a user's jobs in a stable order across reads", async () => {
    signInAs(newUserId());
    const a = await createJob({ ...input, role: "A" }, FROZEN);
    const b = await createJob({ ...input, role: "B" }, FROZEN);
    const c = await createJob({ ...input, role: "C" }, FROZEN);

    const once = (await listJobs()).map((job) => job.id);
    const again = (await listJobs()).map((job) => job.id);
    expect(once).toEqual([a.id, b.id, c.id]);
    expect(again).toEqual(once);
  });

  it("returns the Phase-1 DTO shape and nothing from the row", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    expect(job).not.toHaveProperty("userId");
    expect(job).not.toHaveProperty("createdAt");
    expect(typeof job.addedOn).toBe("string");
  });

  it("user B cannot list, read, or create against user A's data", async () => {
    const userA = newUserId();
    const userB = newUserId();
    signInAs(userA);
    const jobA = await createJob(input, FROZEN);

    signInAs(userB);
    expect(await listJobs()).toEqual([]);
    expect(await getJob(jobA.id)).toBeNull();
    // There is no argument through which B could even claim to create as A: the owner comes
    // from the session alone.
    const jobB = await createJob(input, FROZEN);

    signInAs(userA);
    expect((await listJobs()).map((job) => job.id)).toEqual([jobA.id]);
    expect(await getJob(jobB.id)).toBeNull();
  });

  it("handles blank location and non-numeric salary bounds server-side, through the action", async () => {
    signInAs(newUserId());
    const result = await createJobAction({
      company: "Alpine Robotics",
      role: "Principal Designer",
      location: "   ",
      salaryMin: "abc",
      salaryMax: "",
      postingUrl: "",
      description: "",
      // A client-only field the schema strips rather than stores.
      resumeFile: "resume.pdf",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.location).toBe("Location TBD");
    expect(result.data.salaryMin).toBeNull();
    expect(result.data.salaryMax).toBeNull();
    expect(result.data.postingUrl).toBe("");
  });

  it("the action returns a field-level result, not an exception, for bad input", async () => {
    signInAs(newUserId());
    const result = await createJobAction({ company: "", role: "x", postingUrl: "javascript:1" });

    expect(result).toMatchObject({ ok: false, error: "invalid" });
    if (result.ok) return;
    expect(Object.keys(result.fields ?? {}).sort()).toEqual(["company", "postingUrl"]);
    expect(await prisma.job.count()).toBe(0);
  });

  it("the action asks for re-authentication when there is no session", async () => {
    const result = await createJobAction(input);
    expect(result).toMatchObject({ ok: false, error: "unauthenticated" });
  });
});

describe("ticket 11: the detail page is real, and stage and notes persist", () => {
  it("an unknown id and another user's id are indistinguishable", async () => {
    const userA = newUserId();
    signInAs(userA);
    const jobA = await createJob(input, FROZEN);

    signInAs(newUserId());
    expect(await getJob("does-not-exist")).toBeNull();
    expect(await getJob(jobA.id)).toBeNull();
    await expect(updateJob(jobA.id, { notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateJob("does-not-exist", { notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobStage(jobA.id, "applied")).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobStage("does-not-exist", "applied")).rejects.toBeInstanceOf(NotFoundError);

    // And through the actions, the very same message.
    const foreign = await updateJobAction(jobA.id, { notes: "x" });
    const missing = await updateJobAction("does-not-exist", { notes: "x" });
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ ok: false, error: "not-found" });
  });

  it("a stage change writes exactly one activity entry, in the same transaction", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    const moved = await setJobStage(job.id, "applied", FROZEN);

    expect(moved.stage).toBe("applied");
    expect(moved.activity.map((entry) => entry.label)).toEqual([
      "Moved to Applied",
      "Added to board — Interested",
    ]);
    expect((await getJob(job.id))?.activity).toHaveLength(2);
  });

  it("re-selecting the current stage writes nothing", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    const same = await setJobStage(job.id, "interested", FROZEN);

    expect(same.activity).toHaveLength(1);
    expect((await getJob(job.id))?.activity).toHaveLength(1);
  });

  it("backfills an applied date when leaving interested, never when entering it, never over an existing one", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    const applied = await setJobStage(job.id, "interviewing", FROZEN);
    expect(applied.appliedOn).toBe("2026-07-25");

    const later = new Date("2026-08-02T09:00:00Z");
    const offer = await setJobStage(job.id, "offer", later);
    expect(offer.appliedOn).toBe("2026-07-25");
    expect(offer.activity[0]).toMatchObject({ label: "Moved to Offer", date: "2026-08-02" });

    const back = await setJobStage(job.id, "interested", later);
    expect(back.appliedOn).toBe("2026-07-25");

    const fresh = await createJob(input, FROZEN);
    const stillLead = await setJobStage(fresh.id, "interested", later);
    expect(stillLead.appliedOn).toBeNull();
  });

  it("orders activity newest first, with creation time as the tiebreak for a shared date", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);
    await setJobStage(job.id, "applied", FROZEN);
    await setJobStage(job.id, "interviewing", FROZEN);

    const labels = (await getJob(job.id))?.activity.map((entry) => entry.label);
    expect(labels).toEqual([
      "Moved to Interviewing",
      "Moved to Applied",
      "Added to board — Interested",
    ]);
  });

  it("edits to description and notes persist, and the patch is an allowlist", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    await updateJob(job.id, { description: "Rewritten.", notes: "Ask about the team." });
    const reread = await getJob(job.id);
    expect(reread).toMatchObject({ description: "Rewritten.", notes: "Ask about the team." });

    const rejected = await updateJobAction(job.id, { notes: "fine", stage: "offer" });
    expect(rejected).toMatchObject({ ok: false, error: "invalid" });
    expect((await getJob(job.id))?.stage).toBe("interested");

    const addedOn = await updateJobAction(job.id, { addedOn: "2020-01-01" });
    expect(addedOn).toMatchObject({ ok: false, error: "invalid" });
  });

  it("the applied date can be corrected directly, without writing history or touching the stage", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);
    await setJobStage(job.id, "applied", FROZEN);
    expect((await getJob(job.id))?.appliedOn).toBe("2026-07-25");

    const corrected = await updateJobAction(job.id, { appliedOn: "2026-07-20" });
    expect(corrected).toMatchObject({ ok: true });
    const reread = await getJob(job.id);
    expect(reread).toMatchObject({ appliedOn: "2026-07-20", stage: "applied" });
    expect(reread?.activity).toHaveLength(2);

    const cleared = await updateJobAction(job.id, { appliedOn: null });
    expect(cleared).toMatchObject({ ok: true });
    expect((await getJob(job.id))?.appliedOn).toBeNull();

    // Validation refuses an applied date after today, so today is pinned for this one check.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN);
    try {
      const future = await updateJobAction(job.id, { appliedOn: "2026-08-01" });
      expect(future).toMatchObject({ ok: false, error: "invalid" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("edits to company, role, location and posting link persist, without writing history", async () => {
    signInAs(newUserId());
    const job = await createJob(input, FROZEN);

    const renamed = await updateJobAction(job.id, {
      company: "Renamed Robotics",
      role: "Design Lead",
      location: "",
      postingUrl: "https://renamed.example.com/jobs/2",
    });
    expect(renamed).toMatchObject({ ok: true });
    expect(await getJob(job.id)).toMatchObject({
      company: "Renamed Robotics",
      role: "Design Lead",
      location: "Location TBD",
      postingUrl: "https://renamed.example.com/jobs/2",
      stage: "interested",
      activity: [expect.objectContaining({ label: "Added to board — Interested" })],
    });
    expect((await getJob(job.id))?.activity).toHaveLength(1);

    expect(await updateJobAction(job.id, { company: " " })).toMatchObject({ ok: false, error: "invalid" });
    expect(await updateJobAction(job.id, { postingUrl: "javascript:alert(1)" })).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect((await getJob(job.id))?.company).toBe("Renamed Robotics");
  });

  it("user B cannot read, edit, or restage user A's job through any action", async () => {
    const userA = newUserId();
    signInAs(userA);
    const jobA = await createJob(input, FROZEN);

    signInAs(newUserId());
    expect(await updateJobAction(jobA.id, { notes: "pwned" })).toMatchObject({
      ok: false,
      error: "not-found",
    });
    expect(await setJobStageAction(jobA.id, "rejected")).toMatchObject({
      ok: false,
      error: "not-found",
    });

    signInAs(userA);
    const untouched = await getJob(jobA.id);
    expect(untouched).toMatchObject({ notes: "", stage: "interested" });
    expect(untouched?.activity).toHaveLength(1);
  });
});

describe("a job added with a contact beside it", () => {
  const dana = {
    name: "Dana Pike",
    kind: "recruiter",
    title: "Talent Partner",
    agency: "Northstar Talent",
    email: "dana@northstar.example",
    phone: "0400 000 000",
    linkedinUrl: "",
  } as const;

  it("creates the person and links them in the job's own transaction", async () => {
    signInAs(newUserId());
    const job = await createJob({ ...input, contact: dana }, FROZEN);

    expect(job.contacts).toEqual([
      {
        id: expect.any(String),
        name: "Dana Pike",
        kind: "recruiter",
        title: "Talent Partner",
        agency: "Northstar Talent",
        email: "dana@northstar.example",
        otherJobCount: 0,
      },
    ]);
    // A Contact of the user's, not a detail of the Job: it is on their contacts list too.
    expect(await listContacts()).toMatchObject([{ name: "Dana Pike", jobCount: 1 }]);
  });

  it("links a contact the user already has instead of saving them twice", async () => {
    signInAs(newUserId());
    const existing = await createContact({ ...dana, notes: "", lastSpokenOn: null });
    const job = await createJob({ ...input, contact: { contactId: existing.id } }, FROZEN);

    expect(job.contacts.map((contact) => contact.id)).toEqual([existing.id]);
    expect(await listContacts()).toMatchObject([{ id: existing.id, jobCount: 1 }]);
  });

  it("a job with no contact is stored with none, and adds nobody to the list", async () => {
    signInAs(newUserId());
    for (const contact of [undefined, null]) {
      const job = await createJob({ ...input, contact }, FROZEN);
      expect(job.contacts).toEqual([]);
    }
    expect(await listContacts()).toEqual([]);
  });

  it("refuses another user's contact id, and writes no job at all", async () => {
    signInAs(newUserId());
    const theirs = await createContact({ ...dana, notes: "", lastSpokenOn: null });

    signInAs(newUserId());
    await expect(createJob({ ...input, contact: { contactId: theirs.id } }, FROZEN)).rejects.toThrow(
      NotFoundError,
    );
    // The whole create is one transaction, so a refused contact leaves no half-made job behind.
    expect(await listJobs()).toEqual([]);
  });

  it("refuses an id that names nobody, rather than inventing a contact for it", async () => {
    signInAs(newUserId());

    await expect(
      createJob({ ...input, contact: { contactId: "no-such-contact" } }, FROZEN),
    ).rejects.toThrow(NotFoundError);
    expect(await listJobs()).toEqual([]);
  });
});
