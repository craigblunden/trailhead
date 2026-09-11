import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInAs, signOut } from "./session-mock";

import {
  createContactAction,
  createContactForJobAction,
  deleteContactAction,
  getContactAction,
  linkContactAction,
  unlinkContactAction,
  updateContactAction,
} from "@/server/actions/contacts";
import {
  createContact,
  createContactForJob,
  deleteContact,
  getContact,
  linkContact,
  listContacts,
  unlinkContact,
  updateContact,
} from "@/server/data/contacts";
import { NotFoundError } from "@/server/data/errors";
import { createJob, getJob, setJobStage } from "@/server/data/jobs";

import { newUserId, resetTables } from "./helpers";

const FROZEN = new Date("2026-07-25T12:00:00Z");

const job = (role: string, company = "Fernwood") => ({
  company,
  role,
  location: "Remote (US)",
  salaryMin: null,
  salaryMax: null,
  postingUrl: "",
  description: "",
});

const dana = {
  name: "Dana Whitfield",
  kind: "recruiter" as const,
  title: "Senior Recruiter",
  agency: "Northstar Talent",
  email: "dana@northstar.example",
  phone: "+1 512 555 0134",
  notes: "",
  linkedinUrl: "https://www.linkedin.com/in/dana",
  lastSpokenOn: "2026-07-20",
};

beforeEach(async () => {
  await resetTables();
  signOut();
  // Validation refuses a last-spoken date after today, so today is pinned.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ticket 14: contacts are user-owned and link to many jobs", () => {
  it("creates, edits, and deletes a contact", async () => {
    signInAs(newUserId());
    const created = await createContact(dana);
    expect(created).toMatchObject({ ...dana, jobs: [] });

    const edited = await updateContact(created.id, { notes: "Prefers email.", lastSpokenOn: null });
    expect(edited).toMatchObject({ notes: "Prefers email.", lastSpokenOn: null, name: dana.name });
    expect(await getContact(created.id)).toEqual(edited);

    await deleteContact(created.id);
    expect(await getContact(created.id)).toBeNull();
    expect(await listContacts()).toEqual([]);
  });

  it("links one contact to several jobs; unlinking one leaves the contact and its other links", async () => {
    signInAs(newUserId());
    const growth = await createJob(job("Product Designer, Growth"), FROZEN);
    const brand = await createJob(job("Brand Designer", "Cobalt"), FROZEN);
    const lead = await createJob(job("Lead Designer", "Harvest"), FROZEN);
    const contact = await createContact(dana);

    await linkContact(growth.id, contact.id);
    await linkContact(brand.id, contact.id);
    const linkedToLead = await linkContact(lead.id, contact.id);
    // Linking again is harmless: still one link.
    await linkContact(lead.id, contact.id);

    expect(linkedToLead.contacts).toEqual([
      expect.objectContaining({ id: contact.id, kind: "recruiter", otherJobCount: 2 }),
    ]);
    expect((await listContacts())[0].jobCount).toBe(3);

    const unlinked = await unlinkContact(brand.id, contact.id);
    expect(unlinked.contacts).toEqual([]);

    const after = await getContact(contact.id);
    expect(after?.jobs.map((j) => j.id).sort()).toEqual([growth.id, lead.id].sort());
    expect((await getJob(growth.id))?.contacts[0]).toMatchObject({
      id: contact.id,
      otherJobCount: 1,
    });
  });

  it("a contact's page lists every linked job in pipeline order, ready to group by stage", async () => {
    signInAs(newUserId());
    const a = await createJob(job("Offer role", "Zeta"), FROZEN);
    const b = await createJob(job("Lead role", "Alpha"), FROZEN);
    const c = await createJob(job("Applied role", "Beta"), FROZEN);
    await setJobStage(a.id, "offer", FROZEN);
    await setJobStage(c.id, "applied", FROZEN);
    const contact = await createContact(dana);
    for (const target of [a, b, c]) await linkContact(target.id, contact.id);

    const detail = await getContact(contact.id);
    expect(detail?.jobs).toEqual([
      { id: b.id, company: "Alpha", role: "Lead role", stage: "interested" },
      { id: c.id, company: "Beta", role: "Applied role", stage: "applied" },
      { id: a.id, company: "Zeta", role: "Offer role", stage: "offer" },
    ]);
  });

  it("changing a contact's kind edits the same record rather than creating a second", async () => {
    signInAs(newUserId());
    const role = await createJob(job("Product Designer"), FROZEN);
    const contact = await createContact(dana);
    await linkContact(role.id, contact.id);

    const promoted = await updateContact(contact.id, { kind: "hiring_manager" });

    expect(promoted.id).toBe(contact.id);
    expect(promoted.kind).toBe("hiring_manager");
    expect(await listContacts()).toHaveLength(1);
    expect((await getJob(role.id))?.contacts).toEqual([
      expect.objectContaining({ id: contact.id, kind: "hiring_manager" }),
    ]);
  });

  it("creating from a job asks for name and kind, and links in the same transaction", async () => {
    signInAs(newUserId());
    const role = await createJob(job("Product Designer"), FROZEN);

    const result = await createContactForJobAction(role.id, { name: "Priya Raman", kind: "referrer" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.contacts).toEqual([
      expect.objectContaining({ name: "Priya Raman", kind: "referrer", otherJobCount: 0 }),
    ]);

    // A foreign or missing job creates nothing at all.
    await expect(
      createContactForJob("not-a-job", { name: "Ghost", kind: "other" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await listContacts()).map((c) => c.name)).toEqual(["Priya Raman"]);
  });

  it("validates at the action boundary, with a field-level result", async () => {
    signInAs(newUserId());
    const bad = await createContactAction({ name: "", kind: "boss", linkedinUrl: "javascript:1" });
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    if (!bad.ok) {
      expect(Object.keys(bad.fields ?? {}).sort()).toEqual(["kind", "linkedinUrl", "name"]);
    }

    const created = await createContactAction(dana);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const rejected = await updateContactAction(created.data.id, { userId: newUserId() });
    expect(rejected).toMatchObject({ ok: false, error: "invalid" });
    expect(await listContacts()).toHaveLength(1);
  });

  it("user B cannot read, edit, delete, or link user A's contacts", async () => {
    const userA = newUserId();
    signInAs(userA);
    const jobA = await createJob(job("Role of A"), FROZEN);
    const contactA = await createContact(dana);
    await linkContact(jobA.id, contactA.id);

    signInAs(newUserId());
    const jobB = await createJob(job("Role of B"), FROZEN);

    expect(await listContacts()).toEqual([]);
    expect(await getContact(contactA.id)).toBeNull();
    await expect(updateContact(contactA.id, { name: "pwned" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteContact(contactA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(linkContact(jobB.id, contactA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(linkContact(jobA.id, contactA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(unlinkContact(jobA.id, contactA.id)).rejects.toBeInstanceOf(NotFoundError);

    // Through the actions, a foreign id and a missing one are the same result.
    const foreign = await getContactAction(contactA.id);
    const missing = await getContactAction("does-not-exist");
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ ok: false, error: "not-found" });
    expect(await deleteContactAction(contactA.id)).toEqual(
      await deleteContactAction("does-not-exist"),
    );
    expect(await linkContactAction(jobB.id, contactA.id)).toMatchObject({
      ok: false,
      error: "not-found",
    });
    expect(await unlinkContactAction(jobA.id, contactA.id)).toMatchObject({
      ok: false,
      error: "not-found",
    });

    signInAs(userA);
    const untouched = await getContact(contactA.id);
    expect(untouched).toMatchObject({
      name: dana.name,
      jobs: [expect.objectContaining({ id: jobA.id })],
    });
  });

  it("asks for re-authentication when there is no session", async () => {
    expect(await createContactAction(dana)).toMatchObject({ ok: false, error: "unauthenticated" });
  });
});
