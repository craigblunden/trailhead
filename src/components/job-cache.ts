import type { QueryClient } from "@tanstack/react-query";

import { describeFailure } from "@/components/action-client";
import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";

/**
 * The one module that writes a Job into the browser's cache (architecture ticket 03). Every change to
 * a Job — an edit, a Stage move, a kit slot, a Contact link, a new Job — goes through it, under one
 * policy:
 *
 * - **Reads in flight are cancelled** before anything is written, so a list fetched before the write
 *   cannot land over it.
 * - **The change shows at once** when the caller says what it looks like (`apply`). A caller may
 *   instead wait for the server, as Contact links do; the rest of the policy is the same.
 * - **A refusal rolls back only the fields that change touched**, and only where they still hold its
 *   value: another field saved meanwhile, a later change to the same field, and every other Job keep
 *   what they have since become.
 * - **The server's Job is swapped in**, except for fields another write still has on its way, which
 *   keep that write's value until it settles.
 * - **A failure is described** in words written for the user: a field's own message, then the
 *   action's, then the caller's fallback.
 * - **The list is resynced once**, when the last write in flight settles, so the board ends on what
 *   the server holds without a refetch landing over a change still on its way.
 */

export type JobWrite = {
  /** What the change looks like, to show at once. Omit it to show nothing until the server answers. */
  apply?: (job: Job) => Job;
  /** Sends the change; resolves with the Job as the server wrote it. */
  send: () => Promise<Job>;
  /** What to say when the failure carries no message of its own. */
  fallback: string;
};

export type WriteResult = { ok: true; job: Job } | { ok: false; message: string };

export type RemoveResult = { ok: true } | { ok: false; message: string };

export type JobCache = {
  /** Changes one Job. Never throws: a failure comes back as a message, already rolled back. */
  update(jobId: string, write: JobWrite): Promise<WriteResult>;
  /** Adds a Job, built from the list as it stands when the change is shown. */
  add(build: (jobs: Job[]) => Job, write: Omit<JobWrite, "apply">): Promise<WriteResult>;
  /**
   * Deletes a Job. Rare and deliberate, like a Contact's delete, so it waits for the server rather
   * than showing the removal first: the Job stays in the list until the write settles, and leaves
   * it only once the server has agreed.
   */
  remove(jobId: string, write: { send: () => Promise<void>; fallback: string }): Promise<RemoveResult>;
  /** The Jobs may have changed elsewhere — a Document deleted, a Contact renamed: resync once nothing is in flight. */
  refresh(): void;
  /**
   * A change the server has already made through another path — the cover-letter route storing a
   * Draft — written into the cached Job as the caller says it looks. Nothing to roll back and
   * nothing to resync: the server's answer is in hand, and a list fetch landing later carries it too.
   */
  record(jobId: string, next: (job: Job) => Job): void;
  /**
   * Where `jobId` now lives, if an `add` gave it the server's own id in place of the optimistic one
   * it was shown under. Lets a page opened at the optimistic id — a card clicked before its write
   * settled — follow the Job to where it actually saved, rather than finding nothing there forever.
   */
  redirectFor(jobId: string): string | undefined;
};

type Field = keyof Job;

/** What is on its way against one query client's list of Jobs: how many writes, and which fields of which Job. */
type InFlight = { writes: number; fields: Map<string, Map<Field, number>> };

const inFlightByClient = new WeakMap<QueryClient, InFlight>();

function inFlightFor(queryClient: QueryClient): InFlight {
  let inFlight = inFlightByClient.get(queryClient);
  if (!inFlight) {
    inFlight = { writes: 0, fields: new Map() };
    inFlightByClient.set(queryClient, inFlight);
  }
  return inFlight;
}

/** Optimistic id -> the server's own, once an `add` swaps one in. See `redirectFor`. */
const redirectsByClient = new WeakMap<QueryClient, Map<string, string>>();

function redirectsFor(queryClient: QueryClient): Map<string, string> {
  let redirects = redirectsByClient.get(queryClient);
  if (!redirects) {
    redirects = new Map();
    redirectsByClient.set(queryClient, redirects);
  }
  return redirects;
}

function hold(inFlight: InFlight, jobId: string, fields: readonly Field[]) {
  if (fields.length === 0) return;
  const held = inFlight.fields.get(jobId) ?? new Map<Field, number>();
  for (const field of fields) held.set(field, (held.get(field) ?? 0) + 1);
  inFlight.fields.set(jobId, held);
}

function release(inFlight: InFlight, jobId: string, fields: readonly Field[]) {
  const held = inFlight.fields.get(jobId);
  if (!held) return;
  for (const field of fields) {
    const left = (held.get(field) ?? 1) - 1;
    if (left > 0) held.set(field, left);
    else held.delete(field);
  }
  if (held.size === 0) inFlight.fields.delete(jobId);
}

/** The fields `after` changed from `before`. */
function changedFields(before: Job, after: Job): Field[] {
  return (Object.keys(after) as Field[]).filter((field) => after[field] !== before[field]);
}

/** `target`, with `fields` taken from `source`. */
function withFields(target: Job, source: Job, fields: Iterable<Field>): Job {
  const next: Record<string, unknown> = { ...target };
  for (const field of fields) next[field] = source[field];
  return next as Job;
}

export function jobCache(queryClient: QueryClient): JobCache {
  const inFlight = inFlightFor(queryClient);
  const redirects = redirectsFor(queryClient);

  // Writing during a read also moves the state that read would revert to, so the change can be
  // shown in the same tick as the cancel — a radio or a select that waits even a microtask looks,
  // to the user and to assistive tech, as if the click did nothing.
  const cancelReads = () => void queryClient.cancelQueries({ queryKey: jobsCache.key });

  const read = () => queryClient.getQueryData<Job[]>(jobsCache.key);

  const change = (jobId: string, next: (job: Job) => Job) =>
    queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) =>
      jobs?.map((job) => (job.id === jobId ? next(job) : job)),
    );

  const settled = () => {
    inFlight.writes -= 1;
    if (inFlight.writes === 0) void queryClient.invalidateQueries({ queryKey: jobsCache.key });
  };

  return {
    async update(jobId, { apply, send, fallback }) {
      cancelReads();
      const before = read()?.find((job) => job.id === jobId);
      const after = before && apply ? apply(before) : undefined;
      const fields = before && after ? changedFields(before, after) : [];
      if (after && fields.length > 0) change(jobId, () => after);
      // The cache stores a copy of any array or object that changed (structural sharing), so "still
      // holds this change's value" is judged against what it stored, never against `after` itself.
      const applied = fields.length > 0 ? read()?.find((job) => job.id === jobId) : undefined;

      hold(inFlight, jobId, fields);
      inFlight.writes += 1;
      try {
        const saved = await send();
        release(inFlight, jobId, fields);
        cancelReads();
        const held = inFlight.fields.get(jobId);
        change(jobId, (current) => (held ? withFields(saved, current, held.keys()) : saved));
        return { ok: true, job: saved };
      } catch (error) {
        release(inFlight, jobId, fields);
        cancelReads();
        if (before && applied) {
          change(jobId, (current) =>
            withFields(current, before, fields.filter((field) => current[field] === applied[field])),
          );
        }
        return { ok: false, message: describeFailure(error, fallback) };
      } finally {
        settled();
      }
    },

    async add(build, { send, fallback }) {
      cancelReads();
      const optimistic = build(read() ?? []);
      queryClient.setQueryData<Job[]>(jobsCache.key, (jobs = []) => [...jobs, optimistic]);

      inFlight.writes += 1;
      try {
        const saved = await send();
        cancelReads();
        change(optimistic.id, () => saved);
        if (saved.id !== optimistic.id) redirects.set(optimistic.id, saved.id);
        return { ok: true, job: saved };
      } catch (error) {
        cancelReads();
        queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) => jobs?.filter((job) => job.id !== optimistic.id));
        return { ok: false, message: describeFailure(error, fallback) };
      } finally {
        settled();
      }
    },

    async remove(jobId, { send, fallback }) {
      cancelReads();
      inFlight.writes += 1;
      try {
        await send();
        cancelReads();
        queryClient.setQueryData<Job[]>(jobsCache.key, (jobs) => jobs?.filter((job) => job.id !== jobId));
        return { ok: true };
      } catch (error) {
        cancelReads();
        return { ok: false, message: describeFailure(error, fallback) };
      } finally {
        settled();
      }
    },

    refresh() {
      // A write in flight resyncs the list when it settles; refetching now could land over it.
      if (inFlight.writes === 0) void queryClient.invalidateQueries({ queryKey: jobsCache.key });
    },

    record(jobId, next) {
      change(jobId, next);
    },

    redirectFor(jobId) {
      return redirects.get(jobId);
    },
  };
}
