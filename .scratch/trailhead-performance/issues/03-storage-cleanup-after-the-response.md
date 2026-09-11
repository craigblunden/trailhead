# 03: Upload and delete don't wait for Storage cleanup

**Status:** ready-for-review

**Blocked by:** None (can start immediately)

## What to build

Two Document writes wait on work the user never sees:

- **Starting an upload** first runs the owner's sweep. The sweep marks abandoned uploads as deleted, removes deleted Documents' objects from Storage, and then deletes their rows. Only after all that is the signed upload URL created.
- **Deleting a Document** marks it as deleted, then waits for its object to be removed from Storage before answering.

In both cases the Storage removal is a network round trip, never throws for the caller, and is retried by later sweeps if it fails. The user already sees the Document gone the moment it is marked deleted.

After this ticket, both writes answer as soon as their database work is done, and the Storage removal runs after the response. Next's `after()` supports this, and it can read the request's cookies when called from a Server Function; see the `after` guide in Next's bundled docs.

Two constraints:
- **Marking abandoned uploads as deleted must still happen before the cap is counted.** That is what frees a slot held by an upload that never finished. Only the removal of objects, and the deletion of rows that follows it, moves after the response.
- **Schedule the work from the Server Action, not the data layer.** The integration suites call the data layer directly, outside a Next request, where `after()` is not available. The data layer keeps a way to run the removal inline for them.

The Vercel React best-practices review found this (`server-after-nonblocking`).

## Acceptance criteria

- [x] Starting an upload and deleting a Document no longer wait for a Storage removal before answering.
- [x] A user at the cap whose oldest slot is an abandoned upload can still start a new upload in the same request, because that upload was marked deleted before the count.
- [x] Deleted Documents' objects are still removed from Storage, and their rows still deleted only after their upload URLs have expired. The integration suites that prove this still pass.
- [x] A failed Storage removal after the response is still logged with its operation and Tenant, and the Document stays marked deleted for the sweep to retry.
- [x] The documents and application-kit e2e journeys pass, including deleting every Document at the end so a run leaves nothing in Storage.
- [x] No key that bypasses row-level security is introduced. The removal still runs as the owner.

## Comments

**Done.**
- **Data layer:** starting an upload and deleting a Document take a `Defer` for their Storage cleanup. It is inline by default, so the integration suites and any direct caller keep today's behaviour.
- **Actions:** the document actions pass one that uses `after()`.
- **Upload start:** abandoned uploads are still tombstoned before the cap is counted. Only removing objects, and the row deletes that follow, waits for the response.
- **Failures:** a cleanup that fails after the response is logged as `documents.startUpload.cleanup` or `documents.delete.cleanup`, and the tombstone stays for the sweep.

Tests:
- **Integration:** a delete answers with its object still present, and running the held work removes it. Starting an upload at the cap, with an abandoned upload holding a slot, succeeds in the same request and removes the object afterwards.
- **Unit:** both actions hand their cleanup to `after()`, and a failed cleanup is logged, not thrown.
- **Existing suites:** the whole integration suite passes, and so do the documents, application-kit, and keyboard-only documents e2e journeys, each of which deletes everything it uploads.
