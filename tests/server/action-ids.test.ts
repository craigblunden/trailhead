import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_MESSAGES } from "@/server/action-result";
import {
  createContactForJobAction,
  deleteContactAction,
  getContactAction,
  linkContactAction,
  unlinkContactAction,
  updateContactAction,
} from "@/server/actions/contacts";
import {
  deleteDocumentAction,
  documentLinkAction,
  finishUploadAction,
  setJobDocumentAction,
} from "@/server/actions/documents";
import { setJobStageAction, updateJobAction } from "@/server/actions/jobs";

/**
 * Architecture ticket 07: every Server Action reads the ids it is sent through one definition, so a
 * malformed id gets the same `invalid` result everywhere and never reaches the data layer.
 */
const reached = vi.hoisted(() => vi.fn());

vi.mock("@/server/data/jobs", () => ({
  listJobs: reached,
  createJob: reached,
  updateJob: reached,
  setJobStage: reached,
}));

vi.mock("@/server/data/contacts", () => ({
  createContact: reached,
  createContactForJob: reached,
  deleteContact: reached,
  getContact: reached,
  linkContact: reached,
  listContacts: reached,
  unlinkContact: reached,
  updateContact: reached,
}));

vi.mock("@/server/data/documents", () => ({
  deleteDocument: reached,
  documentDownloadUrl: reached,
  finishUpload: reached,
  listDocuments: reached,
  setJobDocument: reached,
  startUpload: reached,
}));

const MALFORMED: unknown[] = [42, "", "   ", "x".repeat(65), undefined, null, { id: "job-1" }];

/** Each action, called with a malformed id in one position, and what that id was meant to name. */
const CASES: { action: string; call: (id: unknown) => Promise<unknown>; what: string; nullClears?: boolean }[] = [
  { action: "updateJobAction", call: (id) => updateJobAction(id, { notes: "x" }), what: "job" },
  { action: "setJobStageAction", call: (id) => setJobStageAction(id, "offer"), what: "job" },
  { action: "getContactAction", call: (id) => getContactAction(id), what: "contact" },
  { action: "updateContactAction", call: (id) => updateContactAction(id, { name: "Dana" }), what: "contact" },
  { action: "deleteContactAction", call: (id) => deleteContactAction(id), what: "contact" },
  { action: "linkContactAction, the job", call: (id) => linkContactAction(id, "contact-1"), what: "job" },
  { action: "linkContactAction, the contact", call: (id) => linkContactAction("job-1", id), what: "contact" },
  { action: "unlinkContactAction, the job", call: (id) => unlinkContactAction(id, "contact-1"), what: "job" },
  { action: "unlinkContactAction, the contact", call: (id) => unlinkContactAction("job-1", id), what: "contact" },
  {
    action: "createContactForJobAction",
    call: (id) => createContactForJobAction(id, { name: "Dana", kind: "recruiter" }),
    what: "job",
  },
  { action: "finishUploadAction", call: (id) => finishUploadAction(id), what: "document" },
  { action: "deleteDocumentAction", call: (id) => deleteDocumentAction(id), what: "document" },
  { action: "documentLinkAction", call: (id) => documentLinkAction(id), what: "document" },
  { action: "setJobDocumentAction, the job", call: (id) => setJobDocumentAction(id, "resume", "doc-1"), what: "job" },
  {
    action: "setJobDocumentAction, the document",
    call: (id) => setJobDocumentAction("job-1", "resume", id),
    what: "document",
    nullClears: true,
  },
];

beforeEach(() => {
  reached.mockReset();
});

describe("a malformed id (architecture ticket 07)", () => {
  it.each(CASES)("ID-1: $action answers it as invalid, naming what it was meant to be", async ({ call, what, nullClears }) => {
    for (const id of MALFORMED) {
      if (nullClears && id === null) continue;
      expect(await call(id), JSON.stringify(id) ?? "undefined").toEqual({
        ok: false,
        error: "invalid",
        message: ACTION_MESSAGES.invalid,
        fields: { id: `Unknown ${what}` },
      });
    }
    expect(reached).not.toHaveBeenCalled();
  });

  it("ID-2: a kit slot that is neither resume nor cover letter is refused by name, before the data layer", async () => {
    expect(await setJobDocumentAction("job-1", "portfolio", "doc-1")).toEqual({
      ok: false,
      error: "invalid",
      message: ACTION_MESSAGES.invalid,
      fields: { kind: "Choose resume or cover letter" },
    });
    expect(reached).not.toHaveBeenCalled();
  });
});
