"use server";

import type { ContactDetail, ContactListItem } from "@/lib/contacts";
import type { Job } from "@/lib/jobs";
import { invalid, runAction, type ActionResult } from "@/server/action-result";
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
import {
  contactPatchSchema,
  idSchema,
  newContactSchema,
  parseInput,
} from "@/server/validation";

/**
 * Contact actions: validate, call the data layer, translate. Public POST endpoints like every
 * action, so every argument is untrusted — including the ids.
 */

export async function listContactsAction(): Promise<ActionResult<ContactListItem[]>> {
  return runAction("contacts.list", () => listContacts());
}

export async function getContactAction(id: unknown): Promise<ActionResult<ContactDetail>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown contact" });
  return runAction("contacts.get", async () => {
    const contact = await getContact(parsedId.data);
    if (!contact) throw new NotFoundError("contact");
    return contact;
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
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown contact" });
  const parsedPatch = parseInput(contactPatchSchema, patch);
  if (!parsedPatch.ok) return invalid(parsedPatch.errors);
  return runAction("contacts.update", () => updateContact(parsedId.data, parsedPatch.data));
}

export async function deleteContactAction(id: unknown): Promise<ActionResult<null>> {
  const parsedId = parseInput(idSchema, id);
  if (!parsedId.ok) return invalid({ id: "Unknown contact" });
  return runAction("contacts.delete", async () => {
    await deleteContact(parsedId.data);
    return null;
  });
}

export async function linkContactAction(
  jobId: unknown,
  contactId: unknown,
): Promise<ActionResult<Job>> {
  const parsedJob = parseInput(idSchema, jobId);
  const parsedContact = parseInput(idSchema, contactId);
  if (!parsedJob.ok || !parsedContact.ok) return invalid({ id: "Unknown job or contact" });
  return runAction("contacts.link", () => linkContact(parsedJob.data, parsedContact.data));
}

export async function unlinkContactAction(
  jobId: unknown,
  contactId: unknown,
): Promise<ActionResult<Job>> {
  const parsedJob = parseInput(idSchema, jobId);
  const parsedContact = parseInput(idSchema, contactId);
  if (!parsedJob.ok || !parsedContact.ok) return invalid({ id: "Unknown job or contact" });
  return runAction("contacts.unlink", () => unlinkContact(parsedJob.data, parsedContact.data));
}

/** From a Job: name and kind only, then linked (ticket 13). */
export async function createContactForJobAction(
  jobId: unknown,
  input: unknown,
): Promise<ActionResult<Job>> {
  const parsedJob = parseInput(idSchema, jobId);
  if (!parsedJob.ok) return invalid({ id: "Unknown job" });
  const parsed = parseInput(newContactSchema.pick({ name: true, kind: true }), input);
  if (!parsed.ok) return invalid(parsed.errors);
  return runAction("contacts.createForJob", () => createContactForJob(parsedJob.data, parsed.data));
}
