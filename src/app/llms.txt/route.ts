import { BRAND_NAME, SITE_URL } from "@/lib/brand";
import { CONTACT_KIND_LABEL, CONTACT_KINDS, CONTACT_LIMITS } from "@/lib/contacts";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { FEEDBACK_MAX_CHARS } from "@/lib/generation";
import { JOB_LIMITS, LOCATION_FALLBACK } from "@/lib/job-fields";
import { STAGE_META, STAGES } from "@/lib/jobs";

/**
 * `/llms.txt` (llmstxt.org): the product described for a user's own LLM, so it can shape what the
 * user pastes into the forms. Built from the same constants the forms and validation use, so a
 * limit changed in code is a limit changed here. Nothing behind sign-in and nothing about how the
 * app is built — that is the repo-root `llms.txt`, which is never served. Plan numbers are left out
 * on purpose: they change with pricing, and a stale one would mislead quietly.
 */
export const dynamic = "force-static";

const chars = (limit: number) => `${limit.toLocaleString("en-US")} characters`;
const megabytes = (bytes: number) => `${bytes / (1024 * 1024)} MB`;
const list = (items: readonly string[]) => items.join(", ");

const stages = list(STAGES.map((stage) => STAGE_META[stage].label));
const contactKinds = list(CONTACT_KINDS.map((kind) => CONTACT_KIND_LABEL[kind]));
const fileTypes = Object.keys(ACCEPTED_TYPES).map((extension) => extension.toUpperCase()).join(" or ");

const TEXT = `# ${BRAND_NAME}

> ${BRAND_NAME} is a job-application tracker for one person running many applications at once. Every role sits on one board, from first interest to signed offer, with the resume and cover letter sent, the people involved, and a dated history of how far it got.

This file describes the pages a signed-in user works with and what each form accepts, so an LLM can turn a posting, a recruiter's email or a profile into text the user can paste straight in. ${BRAND_NAME} has no public API: everything is entered by the user, in the pages below. Accounts are private; nothing on a board is shared or public.

- [Get started](${SITE_URL}/signup): create an account
- [Sign in](${SITE_URL}/login)

## The board

The board is the home page once signed in. It has one column per Stage, in this order: ${stages}. Rejected is kept on the board rather than removed. A job moves between Stages by dragging its card, or from its own page.

The "Add job" button opens the "Add a job" form:

- Company (required, up to ${chars(JOB_LIMITS.company)})
- Role title (required, up to ${chars(JOB_LIMITS.role)})
- Location (free text such as "Hybrid / Brisbane", up to ${chars(JOB_LIMITS.location)}; blank reads as "${LOCATION_FALLBACK}")
- Salary range (k): a minimum and a maximum, each a whole number of thousands per year (150 means 150,000); either may be blank
- Application link: the posting's web address, http or https only, up to ${chars(JOB_LIMITS.postingUrl)}
- Job description: the posting text, pasted as-is, up to ${chars(JOB_LIMITS.description)}
- Optionally one person connected with the job: choose an existing Contact, or type a new one's name, kind and details

A new job starts at Interested. Moving it off Interested fills in an applied date of today if it has none.

## A job's page

Opening a card shows the job's page:

- Application stage: a menu of the five Stages
- "Edit details": company, role title, location and application link, with the same limits as adding
- Details: the salary expectation, and the applied date (never later than today)
- Job description: editable, up to ${chars(JOB_LIMITS.description)}, saved with its own button. It is what cover letters are written from.
- Notes: private free text, up to ${chars(JOB_LIMITS.notes)}, saved with its own button
- Rejection letter: shown only while the job is Rejected, with the description folded away above it ("Show description" opens it). Paste the message the company sent, up to ${chars(JOB_LIMITS.rejectionLetter)}, kept for reference.
- Application kit: the resume and cover letter sent with this job, each chosen from the user's Documents
- Cover letters: "Write cover letter" writes a letter for this job from its resume and job description. Under a letter, "What should change?" takes short feedback (up to ${chars(FEEDBACK_MAX_CHARS)}) about the letter, and "Rewrite" writes it again with that feedback. Each write counts toward the week's cover letters.
- Contacts: the people linked to this job
- Activity: a dated history the app writes itself, such as "Moved to Interviewing"; it cannot be typed into

## Documents

The Documents page holds the user's uploaded resumes and cover letters, each usable with any number of jobs.

- Each upload is one file, a resume or a cover letter: ${fileTypes}, up to ${megabytes(MAX_UPLOAD_BYTES)}
- The file must be readable text: a scanned or photographed PDF, a password-protected file, or a long document rather than a resume or letter is refused
- A revised file is uploaded as a new Document; Documents are never edited in place
- A Document can be downloaded or deleted. Deleting one leaves the jobs it was sent with intact.

## Contacts

The Contacts page lists the people the user knows through their search, each linked to every job they are involved in. Its "Add a contact" panel asks only for:

- Name (required, up to ${chars(CONTACT_LIMITS.name)})
- Kind: one of ${contactKinds}. A recruiter who becomes the hiring manager is the same Contact with a new kind.

The rest is filled in on the Contact's own page:

- Title: their title where they work, such as "Design Manager" (up to ${chars(CONTACT_LIMITS.title)})
- Agency: the recruitment firm they work for, when it is not the hiring company (up to ${chars(CONTACT_LIMITS.agency)})
- Email (up to ${chars(CONTACT_LIMITS.email)}) and Phone (up to ${chars(CONTACT_LIMITS.phone)})
- LinkedIn: a profile link, http or https only (up to ${chars(CONTACT_LIMITS.linkedinUrl)})
- Last spoke: a date, never later than today
- Notes: up to ${chars(CONTACT_LIMITS.notes)}

## Optional

- Account page: who the user is signed in as, their plan, and deleting the account for good. Each plan sets how many Documents can be held and how many cover letters can be written a week.
`;

export function GET() {
  return new Response(TEXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
