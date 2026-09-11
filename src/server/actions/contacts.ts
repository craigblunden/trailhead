"use server";

import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import type { Job } from "@/lib/jobs";
import { invalid, parseId, runAction, type ActionResult } from "@/server/action-result";
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
import { contactPatchSchema, newContactSchema, parseInput } from "@/server/validation";

/**
 * Contact actions: validate, call the data layer, translate. Public POST endpoints like every
 * action, so every argument is untrusted — including the ids.
 */

export async function listContactsAction(): Promise<ActionResult<ContactListItem[]>> {
  return runAction("contacts.list", () => listContacts());
}

export async function getContactAction(id: unknown): Promise<ActionResult<ContactDetail>> {
  const contact = parseId(id, "contact");
  if (!contact.ok) return contact.failure;
  return runAction("contacts.get", async () => {
    const found = await getContact(contact.id);
    if (!found) throw new NotFoundError("contact");
    return found;
  });
}

export async function createContactAction(input: unknown): Promise<ActionResult<ContactDetail>> {
  const parsed = parseInput(newContactSchema, input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("contacts.create", () => createContact(parsed.data));
}

export async function updateContactAction(
  id: unknown,
  patch: unknown,
): Promise<ActionResult<ContactDetail>> {
  const contact = parseId(id, "contact");
  if (!contact.ok) return contact.failure;
  const parsedPatch = parseInput(contactPatchSchema, patch);
  if (!parsedPatch.ok) return invalid(parsedPatch.errors);
  return runAction("contacts.update", () => updateContact(contact.id, parsedPatch.data));
}

export async function deleteContactAction(id: unknown): Promise<ActionResult<null>> {
  const contact = parseId(id, "contact");
  if (!contact.ok) return contact.failure;
  return runAction("contacts.delete", async () => {
    await deleteContact(contact.id);
    return null;
  });
}

export async function linkContactAction(
  jobId: unknown,
  contactId: unknown,
): Promise<ActionResult<Job>> {
  const job = parseId(jobId, "job");
  if (!job.ok) return job.failure;
  const contact = parseId(contactId, "contact");
  if (!contact.ok) return contact.failure;
  return runAction("contacts.link", () => linkContact(job.id, contact.id));
}

export async function unlinkContactAction(
  jobId: unknown,
  contactId: unknown,
): Promise<ActionResult<Job>> {
  const job = parseId(jobId, "job");
  if (!job.ok) return job.failure;
  const contact = parseId(contactId, "contact");
  if (!contact.ok) return contact.failure;
  return runAction("contacts.unlink", () => unlinkContact(job.id, contact.id));
}

/** From a Job: name and kind only, then linked (ticket 13). */
export async function createContactForJobAction(
  jobId: unknown,
  input: unknown,
): Promise<ActionResult<Job>> {
  const job = parseId(jobId, "job");
  if (!job.ok) return job.failure;
  const parsed = parseInput(newContactSchema.pick({ name: true, kind: true }), input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("contacts.createForJob", () => createContactForJob(job.id, parsed.data));
}
