# Trailhead

A job-application tracker for an individual job seeker running 5–30 concurrent applications — every
role from first spark to signed offer, on one board. No teams, no sharing, no roles.

## Language

### The pipeline

**Job**:
One role at one company that the user is pursuing, from lead to outcome. The unit the board is built
from, and the thing every other concept hangs off.
_Avoid_: Application, Opportunity, Listing, Posting — "the Fernwood application" and "the Fernwood
job" are the same record, and the code says `Job`. Reserve _posting_ for the external advert the
`postingUrl` points at.

**Stage**:
Where a Job sits in the pipeline: interested, applied, interviewing, offer, rejected. Exactly five,
and the set is load-bearing — a database enum and the board's columns both derive from it.
_Avoid_: Status, State, Column, Step

**Active stage**:
A Stage whose outcome is still open — every stage but rejected.

**Activity entry**:
A dated line in a Job's history ("Moved to Interviewing"). Written by the system as a side effect of
change, never composed by the user.
_Avoid_: Event, Log, History item

### People

**Contact**:
A person the user knows in connection with their search, owned by the user rather than by any one
Job, and linked to every Job they are involved in.
_Avoid_: Lead, Connection, Person

**Recruiter**:
A **kind of Contact**, not a separate thing. Other kinds: hiring manager, referrer. A recruiter who
later becomes the hiring manager is one Contact whose kind changed, never two records.

**Agency**:
The independent firm a recruiter works for, when it differs from the company hiring. An attribute of
a Contact in this phase, not a record in its own right — so "the agency" never means something you
can open.

### Documents and analysis

**Document**:
A file the user uploaded — a resume or a cover letter — owned by the user and sent with as many Jobs
as they like. Uploading a revised file creates a new Document; a Document is never versioned in place.
_Avoid_: File, Attachment, Upload, Resume (as an entity — a resume is a _kind_ of Document)

**Application kit**:
The Documents that go out with one Job — at most one resume and one cover letter, chosen from the
user's Documents. A name for that pair on the job page, not a record, and not a synonym for a Job.
_Avoid_: Attachment (for a Document), Application (for the Job itself)

**Requirement**:
A single typed thing one job description asks for — a skill, a credential, proof of work, a span of
experience. The atom of a job description once it has been read.
_Avoid_: Criterion, Ask, Qualification

**Evidence**:
A single typed thing one Document demonstrates. Deliberately the mirror of a Requirement, so the two
can be compared rather than merely read side by side.
_Avoid_: Skill, Achievement, Claim

**Gap**:
A Requirement with no matching Evidence. The output the whole analysis feature exists to produce.
_Avoid_: Weakness, Missing skill, Deficiency

**Analysis**:
The stored result of comparing one Document against one Job's Requirements. Persisted, and stamped
with what it saw, so it can go **stale** when either side changes.
_Avoid_: Report, Review, Scan

**Portfolio review**:
The aggregate pass across every active Job at once, which is where recurring Gaps become visible
("most of these roles want proof of work"). Distinct from an Analysis, which sees exactly one Job.

**Outcome review**:
The aggregate pass relating the Documents sent with each Job to the Stage that Job reached, which is
where what is working becomes visible ("jobs sent the research resume reach interviewing more
often"). Reads Application kits and Stages, never job descriptions — so it finds no Gaps.
_Avoid_: Insights, Analytics, Report

**Stale**:
Said of an Analysis whose Document or job description has changed since it ran. A stale Analysis is
still shown, and never silently recomputed — re-running is always the user's act.

### Writing letters

**Feedback**:
Short free text the user types about a letter they have just read ("shorter; lead with the Fernwood
project"). Written by the user, sent only to the writer, and treated as material about the letter,
never as directions to the writer.
_Avoid_: Instructions, Prompt, Notes (which are the Job's private notes)

**Rewrite**:
Writing a letter again for the same Job from the same resume and posting, the letter it replaces, and
the user's Feedback. Costs one letter, like a first write.
_Avoid_: Regenerate, Retry (a retry is the same write again after a failure)

**Draft**:
The last letter written for one Job, kept so the user can read it on return and ask for a Rewrite.
Each write replaces it, and it is never a Document: the user makes it one by uploading it.
_Avoid_: Letter (as an entity), Generated letter, Output, Document (for a Draft)

**Flag**:
One write whose Feedback carried directions to the writer rather than changes to the letter, or
Feedback refused before any write for carrying hidden characters. A letter that was written is still
delivered and still counted; the Flag is remembered against the quota week.
_Avoid_: Strike, Violation, Incident

**Hold**:
A pause on writing letters for one Tenant, placed by the system at the second Flag in one quota
week and lasting until that week ends. Nothing else about the Tenant changes: the board, Documents,
and Contacts are untouched.
_Avoid_: Ban, Suspension, Block, Lockout

### Boundaries

**Tenant**:
One user and everything they own. Tenancy here means **isolation**, never collaboration: there is no
row a second user may read, and no concept of a shared or public Job. Every Tenant is on exactly one
Plan.
_Avoid_: Organization, Workspace, Account (as a synonym — an _account_ is the user's login, which is
a different idea)

### Limits

**Plan**:
Which set of Limits a Tenant lives under: `free`, `basic`, or `pro`, in rising order. A Tenant with no Plan recorded is on
`free`. A Plan says nothing about how the Tenant came to be on it — granted by hand and paid for are
the same Plan.
_Avoid_: Tier, Subscription, Membership, Paid user, Premium

**Limit**:
A number a Plan sets: how many Documents a Tenant may hold, and how many cover letters may be
written per week. A Limit may be **unlimited**. Changing Plan never deletes anything: a Tenant over a
Limit keeps what it has and cannot add until under it again.
_Avoid_: Cap, Quota (as a synonym — the _quota_ is this week's count against the letters Limit)
