# 14: Contacts become user-owned and link to many jobs

**Status:** ready-for-agent

**Blocked by:** 11, 13

## What to build

A user records the people in their search once, and sees every role each of them is connected to. The
disabled "Add" button on the job detail page becomes real.

**A Contact belongs to the user, not to a job.** A recruiter who sends four roles is one Contact
linked to four Jobs, not four copies. That relationship is the entire reason for this ticket, and the
question it has to answer visually is *"which roles has Dana sent me?"* — ticket 13 decided how.

**"Recruiter" is a kind of Contact, not a separate entity.** The kinds are recruiter, hiring manager,
referrer, and other. A recruiter who later becomes the hiring manager is one Contact whose kind
changed, never two records. **Agency is free text on the Contact**, not a record — so "the agency" is
never something the user can open. Both of these are glossary decisions in `CONTEXT.md`; if the
implementation drifts, the glossary is what is right.

The field list, the required/optional split, and where editing happens were all settled by ticket 13.
Build what it decided.

## Acceptance criteria

- [ ] A user creates a Contact, edits it, and deletes it
- [ ] A Contact links to more than one Job, and unlinking from one Job leaves the Contact and its other
      links intact
- [ ] From a Contact, the user can see every Job it is linked to
- [ ] From a Job, the user can see and manage its Contacts, and reach the Contact itself
- [ ] Changing a Contact's kind does not create a second record
- [ ] Every field is bounded and validated per ticket 13's decision, with tests at the boundaries
- [ ] A cross-user integration test proves user B cannot read, edit, delete, or link user A's Contacts
- [ ] New and changed surfaces produce zero axe violations and no horizontal overflow at 320, 768,
      1024, and 1440px
