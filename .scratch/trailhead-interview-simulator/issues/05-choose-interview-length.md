# 05: Choose interview length (5, 10, or 30 minutes)

**What to build:** The start screen offers a `pro` Tenant a real length choice, replacing ticket
01's hardcoded length, and the chosen length determines the Category-mix question count per the
spec's table.

**Blocked by:** 01.

**Status:** ready-for-agent

Category mix by length, from the spec:

```
5 min:  1 personal, 1 behavioural, 1 stakeholder, 1 technical, 1 design (5 total)
10 min: 2 each (10 total)
30 min: 2 personal, 3 behavioural, 3 stakeholder, 4 technical, 3 design (15 total)
```

- [ ] The start screen presents 5/10/30-minute options to a `pro` Tenant.
- [ ] The chosen length determines question counts per Category following the table above.
- [ ] The chosen length is persisted on the Attempt and drives its total countdown (ticket 02).
- [ ] The Route Handler/orchestration rejects a length not permitted for the Tenant's Plan.
- [ ] The UI is tested with `fetch` mocked, covering each length choice producing the right
      question-count request.
