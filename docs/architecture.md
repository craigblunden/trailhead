# Architecture

Trailhead is one Next.js application deployed to Vercel, backed by one Supabase project (Postgres,
Auth, Storage), with a single outbound AI call to the Anthropic API. There is no queue, no worker,
and no second service: generation and document ingestion run in-request, and `pg_cron` runs one
janitor.

The terms below are the glossary's (`CONTEXT.md`): a **Job**, a **Contact**, a **Document**, a
**Tenant**.

## The system

```mermaid
flowchart LR
  browser(["Browser<br/>the job seeker"])

  subgraph vercel["Vercel — the Next.js application"]
    proxy["proxy.ts<br/>optimistic redirects only"]
    pages["Server Components<br/>pages + TanStack prefetch"]
    actions["Server Actions<br/>validate → data layer"]
    route["Route Handler<br/>POST /api/jobs/[id]/cover-letter"]
    dal["Data access layer<br/>requireSession · withTenant"]
    ingest["Ingestion<br/>unpdf · mammoth"]
  end

  subgraph supabase["Supabase"]
    auth["Auth<br/>email + Google / GitHub"]
    pooler["Supavisor<br/>transaction mode"]
    pg[("Postgres<br/>row-level security on every table")]
    storage["Storage<br/>private documents bucket"]
    cron["pg_cron<br/>document janitor"]
  end

  anthropic["Anthropic API<br/>claude-opus-5"]
  smtp["SMTP<br/>(Mailpit locally)"]

  browser -->|"pages, navigation"| proxy --> pages
  browser -->|"Server Action POSTs"| actions
  browser -->|"fetch: write a cover letter"| route
  browser -->|"sign in, OAuth, session cookie"| auth
  browser -->|"PUT file bytes via signed upload URL"| storage

  pages --> dal
  actions --> dal
  route --> dal
  route --> anthropic
  dal -->|"validate session: getUser"| auth
  dal -->|"trailhead_app, tenant set per transaction"| pooler --> pg
  dal -->|"as the user: sign, download, remove"| storage
  dal --> ingest
  auth --> smtp
  cron -->|"as postgres: finish tombstones"| pg
  storage -. "objects are rows under RLS" .- pg
```

Two things never pass through the application: **file bytes on the way in** (the browser uploads
straight to Storage through a short-lived signed URL, because a request body through Vercel is capped
below the 5 MB this app accepts) and **any credential that bypasses row-level security** (there is no
`service_role` key anywhere; the app role is `NOBYPASSRLS`).

## A request, layer by layer

Every read and write follows the same path, and each layer has one job. The boundaries are enforced
by `tests/server/boundaries.test.ts`, not just described.

```mermaid
flowchart TB
  component["Client Component<br/>e.g. the job page"]
  cache["Job cache module → TanStack Query cache<br/>shown at once; a refusal rolls back only its own fields"]
  client["Actions client<br/>one mapping: result → ActionError"]
  action["Server Action — public POST endpoint<br/>zod validation, one id check, no queries"]
  result["action-result.ts<br/>domain errors → safe messages"]
  data["src/server/data/*<br/>requireSession(); owner in every where"]
  tenant["withTenant()<br/>transaction · set_config app.tenant_id"]
  mappers["mappers.ts<br/>rows → DTOs; Prisma types stop here"]
  db[("Postgres<br/>policies compare userId to tenant_id()")]

  component --> cache --> client --> action --> data --> tenant --> db
  data --> mappers
  action --> result
```

- **Authentication** is checked in three places, and only the last two count: `proxy.ts` redirects on
  the session cookie's say-so (fast, not authorization); pages call `requirePageSession()`; every
  data function calls `requireSession()`, which validates with Auth.
- **Tenancy is enforced by Postgres.** `withTenant(userId, fn)` opens a transaction whose first
  statement sets `app.tenant_id` transaction-locally; forced RLS policies on every table compare each
  row's `userId` to it, and a query outside a tenant transaction sees nothing. Write checks also
  refuse references to another tenant's rows (a Job's resume, a Contact link).
- **Nothing internal reaches a browser.** Actions and the Route Handler translate typed domain errors
  (`NotFoundError`, `RuleError`) into written messages; everything else is logged as one JSON line
  (operation, tenant, error name and message) and the user gets a generic failure.

## Uploading a document

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as Server Action
  participant D as Data layer
  participant PG as Postgres
  participant S as Storage

  B->>A: startUpload(name, kind, size)
  A->>D: validated input
  D->>PG: lock tenant · check cap of 3 · insert pending row + key
  D->>S: createSignedUploadUrl(key) as the user
  D-->>B: path + token
  B->>S: PUT bytes (bucket enforces 5 MB, PDF/DOCX)
  B->>A: finishUpload(id)
  D->>S: download(key) as the user
  D->>D: sniff bytes · extract text (unpdf / mammoth)
  alt readable
    D->>PG: mark ready, store text
    D-->>B: the Document
  else no text layer, locked, mismatched, unreadable
    D->>PG: mark failed · tombstone
    D->>S: remove(key)
    D-->>B: a refusal that names what to do
  end
```

The row exists before the object can: nothing lands in the bucket that the database never knew
about.

## Deleting a document, and the sweep

```mermaid
flowchart LR
  del["deleteDocument"] --> tomb["1 · one transaction:<br/>lock row, detach from Jobs,<br/>set deletedAt"]
  tomb --> remove["2 · Storage API remove,<br/>as the owner"]
  remove --> keep{"row older than<br/>its upload URL<br/>(3 h)?"}
  keep -- yes --> hard["3 · delete the row"]
  keep -- no --> wait["keep the tombstone"]
  wait --> owner["owner's sweep<br/>(on their next upload):<br/>remove again, then delete"]
  cron["pg_cron every 15 min<br/>as postgres"] --> finish["delete tombstones whose object<br/>is gone and URL expired;<br/>tombstone abandoned uploads"]
```

Storage rows are never deleted with SQL. A tombstone is kept until the signed upload URL minted for
its row has expired, because that URL can put a file back even after the Document is deleted. Objects
are removed only through the Storage API, as their owner — so `pg_cron` finishes rows but cannot
remove files, and a user who never returns can leave a file behind (`docs/deferred.md`).

## Writing a cover letter

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (card)
  participant R as Route Handler
  participant G as Generation module
  participant D as Data layer
  participant PG as Postgres
  participant C as Anthropic API

  B->>R: POST /api/jobs/:id/cover-letter
  R->>G: generateCoverLetter(job, Claude client)
  G->>D: coverLetterInputs(job) — not yours, or no resume or description
  G->>D: reserveCoverLetter() — upsert, only while used < 5 this week
  D->>PG: quota row under RLS
  G->>C: messages.create (claude-opus-5, adaptive thinking, refusal fallback)
  alt stop_reason end_turn
    C-->>G: letter text
    G-->>R: letter · letters left
    R-->>B: 200 · letter · letters left
  else refusal, error, timeout, truncated, crash
    G->>D: refundCoverLetter()
    G-->>R: failure · refunded only if the refund worked
    R-->>B: 4xx or 5xx · refunded · letters left
  end
```

It is a Route Handler, not a Server Action, because Next runs a page's Server Actions one at a time:
a 10–25 second generation as an action would hold every other edit on the page behind it. Nothing is
stored except the quota counter. The order — inputs, reservation, call, refund — and whether a refund
really happened belong to the generation module (`src/server/generation/generate-cover-letter.ts`);
the Route Handler checks the session and the id, makes one call, and maps the outcome to a status.

## The data model

```mermaid
erDiagram
  Job ||--o{ ActivityEntry : "history"
  Job ||--o{ JobContact : ""
  Contact ||--o{ JobContact : ""
  Document |o--o{ Job : "resume of"
  Document |o--o{ Job : "cover letter of"

  Job {
    string id
    uuid userId
    string company
    string role
    enum stage
    string description
    string notes
    string resumeId
    string coverLetterId
  }
  Contact {
    string id
    uuid userId
    string name
    enum kind
    string agency
    date lastSpokenOn
  }
  JobContact {
    string jobId
    string contactId
    uuid userId
  }
  ActivityEntry {
    string id
    uuid userId
    string label
    date date
  }
  Document {
    string id
    uuid userId
    enum kind
    string storageKey
    enum ingestion
    string text
    timestamp deletedAt
  }
  GenerationQuota {
    uuid userId
    date weekStart
    int used
  }
```

Every table carries its own `userId`, so every policy tests a column rather than reaching through a
parent. Users themselves live in Supabase's `auth` schema, which Prisma does not model.

## Where the decisions are

- `CONTEXT.md` — the glossary.
- `.scratch/trailhead-build/issues/` — each ticket, with a record of what was built and why. Later
  efforts sit beside it, one directory each: `trailhead-performance`, `trailhead-architecture`,
  `trailhead-board-dnd`.
- `docs/provisioning.md` — the hosted setup, the two database roles, and what was verified on the
  local stack.
- `docs/supersedes.md` and `docs/deferred.md` — what this replaced, and what it deliberately left out.
