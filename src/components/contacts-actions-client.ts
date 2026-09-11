import { unwrap } from "@/components/action-client";
import type { ContactsClient } from "@/lib/contacts-client";
import {
  createContactAction,
  createContactForJobAction,
  deleteContactAction,
  getContactAction,
  linkContactAction,
  listContactsAction,
  unlinkContactAction,
  updateContactAction,
} from "@/server/actions/contacts";

/** The contacts UI's client over Server Actions — the only write path from the browser. */
export function createActionsContactsClient(): ContactsClient {
  return {
    list: async () => unwrap(await listContactsAction()),
    get: async (id) => unwrap(await getContactAction(id)),
    create: async (input) => unwrap(await createContactAction(input)),
    update: async (id, patch) => unwrap(await updateContactAction(id, patch)),
    remove: async (id) => {
      unwrap(await deleteContactAction(id));
    },
    link: async (jobId, contactId) => unwrap(await linkContactAction(jobId, contactId)),
    unlink: async (jobId, contactId) => unwrap(await unlinkContactAction(jobId, contactId)),
    createForJob: async (jobId, input) => unwrap(await createContactForJobAction(jobId, input)),
  };
}
