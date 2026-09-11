# 05: One in-memory store serves Jobs, Contacts, and Documents in component tests

**Status:** ready-for-agent

**Blocked by:** 02

## What to build

Component tests run the providers against three in-memory adapters, one per client interface. Each adapter keeps its own copy of the Jobs, and each re-creates server rules by hand:

- a Contact's "also on N other jobs"
- sort order
- a Document's kind check
- not-found messages

Linking a Contact or attaching a Document therefore changes a store the other two adapters never see. A test cannot follow a change from one entity to another. The Jobs adapter also still ships in production code, left over from the prototype.

After this ticket, one in-memory store satisfies all three client interfaces. It holds Jobs, Contacts, Documents, and the links between them, and it:

- lives with the tests
- applies the Job rules from ticket 02
- takes its messages from the same source the server uses

The client interfaces and the Server Actions adapters don't change. Each seam keeps its two adapters.

## Acceptance criteria

- [ ] One store backs all three client interfaces in the component test harness.
- [ ] In a single test:
  - attaching a Document shows on the Job and in the Document's "on N jobs"
  - linking a Contact shows on the Job and in the Contact's count of roles
- [ ] Not-found and wrong-kind messages come from one source and match what the server's actions return.
- [ ] No in-memory adapter remains in production code, and the fixtures boundary test still passes.
- [ ] Every existing component test passes. The only ones rewritten are those that built a fake by hand.
