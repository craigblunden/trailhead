import type { Stage } from "@/lib/jobs";

/**
 * A Contact is owned by the user and linked to every Job they are involved in. "Recruiter" is a
 * kind of Contact, never a separate record (CONTEXT.md), so a recruiter who becomes the hiring
 * manager is one Contact whose kind changed.
 */
export const CONTACT_KINDS = ["recruiter", "hiring_manager", "referrer", "other"] as const;

export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  referrer: "Referrer",
  other: "Other",
};

/** The kind a new Contact's form starts on (ticket 13). The column's own default is `other`. */
export const DEFAULT_CONTACT_KIND: ContactKind = "recruiter";

/** A row in the contacts list. */
export type ContactListItem = {
  id: string;
  name: string;
  kind: ContactKind;
  title: string;
  agency: string;
  /** How many Jobs this Contact is linked to. */
  jobCount: number;
};

/** A Job as it appears under "Roles with <name>". */
export type ContactJob = {
  id: string;
  company: string;
  role: string;
  stage: Stage;
};

/** Everything on a Contact's own page. */
export type ContactDetail = {
  id: string;
  name: string;
  kind: ContactKind;
  title: string;
  agency: string;
  email: string;
  phone: string;
  notes: string;
  linkedinUrl: string;
  /** ISO `YYYY-MM-DD`, set by the user, never derived. */
  lastSpokenOn: string | null;
  jobs: ContactJob[];
};

/** "Recruiter · Northstar Talent", or just the kind when there is no agency. */
export function kindLine(contact: { kind: ContactKind; agency: string }): string {
  return contact.agency
    ? `${CONTACT_KIND_LABEL[contact.kind]} · ${contact.agency}`
    : CONTACT_KIND_LABEL[contact.kind];
}

/**
 * Ticket 13 decided these bounds, enforced by the server's schema and mirrored by the forms. Name and kind are required; everything else is optional and
 * stored blank. Last spoken is set by the user, never derived, and never in the future.
 */
export const CONTACT_LIMITS = {
  name: 120,
  title: 120,
  agency: 120,
  email: 254,
  phone: 40,
  notes: 2_000,
  linkedinUrl: 2048,
} as const;
