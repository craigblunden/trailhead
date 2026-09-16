"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { unwrapping } from "@/components/action-client";
import { jobCache, type RemoveResult, type WriteResult } from "@/components/job-cache";
import { contactsCache } from "@/lib/contacts-client";
import { todayUtc } from "@/lib/dates";
import type { Job, Stage } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import type { JobPatch, JobsClient, NewJobInput } from "@/lib/jobs-client";
import { movedJob, newJob, optimisticId } from "@/lib/jobs-rules";
import {
  createJobAction,
  deleteJobAction,
  listJobsAction,
  setJobStageAction,
  updateJobAction,
} from "@/server/actions/jobs";

export type { JobPatch, NewJobInput };

export type JobsStatus = "pending" | "error" | "success";

type JobsContextValue = {
  jobs: Job[];
  status: JobsStatus;
  getJob: (id: string) => Job | undefined;
  addJob: (input: NewJobInput) => void;
  /** Resolves true once the server holds the patch, false once a refusal has been rolled back. */
  updateJob: (id: string, patch: JobPatch) => Promise<boolean>;
  /** Moves a Job to a Stage. False when there was nothing to do: no such Job, or already there. */
  setStage: (id: string, stage: Stage) => boolean;
  /** Deletes a Job for good. Resolves true once the server has agreed, false on a refused delete. */
  removeJob: (id: string) => Promise<boolean>;
  /** The most recent write failure, already rolled back. Null when there is none. */
  error: string | null;
  dismissError: () => void;
  /** Refetches the list — the recovery from a failed load. */
  reload: () => void;
  /** Where a Job opened at an optimistic id now lives, once its add has taken the server's own. */
  redirectFor: (id: string) => string | undefined;
};

const JobsContext = createContext<JobsContextValue | null>(null);

/** Jobs over Server Actions — the only write path from the browser. */
const defaultClient: JobsClient = {
  list: unwrapping(listJobsAction),
  add: unwrapping(createJobAction),
  update: unwrapping(updateJobAction),
  setStage: unwrapping(setJobStageAction),
  remove: unwrapping(deleteJobAction),
};

/**
 * Job state lives in TanStack Query. The server prefetches the list under `jobsCache.key` and
 * this component reads the same key, so hydration hands the client a warm cache. What TanStack
 * buys over the Phase-1 `useState`: refetch on window focus and on reconnect (a tracker left open
 * overnight no longer shows stale data), and retry with backoff on the read path. Deduplication
 * and shared state were already there.
 *
 * Every write goes through the Job cache module, which shows it at once, rolls back only what a
 * refused write changed, and settles on what the server wrote. This provider says what each change
 * looks like — by the Job rules — and keeps the last failure for the page to show.
 */
export function JobsProvider({
  children,
  client = defaultClient,
}: {
  children: React.ReactNode;
  /** Where jobs come from and go to. Defaults to the Server Actions client; tests inject one. */
  client?: JobsClient;
}) {
  const queryClient = useQueryClient();
  const cache = useMemo(() => jobCache(queryClient), [queryClient]);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery(jobsCache.options(() => client.list()));
  const jobs = useMemo(() => query.data ?? [], [query.data]);

  const report = useCallback((result: WriteResult | RemoveResult) => {
    if (!result.ok) setError(result.message);
  }, []);

  const status: JobsStatus = query.status;
  const { refetch } = query;

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      status,
      getJob: (id) => jobs.find((job) => job.id === id),
      addJob: (input) => {
        void cache
          .add(
            (current) => newJob(input, { today: todayUtc(), existingCount: current.length, newId: optimisticId }),
            {
              send: () => client.add(input),
              fallback: "That job wasn't saved. Check your connection and try again.",
            },
          )
          .then((result) => {
            report(result);
            // A Job added with a Contact either saved a new person or linked one the user already
            // had, so the contact list holds neither the right names nor the right role counts —
            // and the next Job's search reads that list to offer them.
            if (result.ok && input.contact) {
              void queryClient.invalidateQueries({ queryKey: contactsCache.listKey });
            }
          });
      },
      updateJob: (id, patch) =>
        cache
          .update(id, {
            apply: (job) => ({ ...job, ...patch }),
            send: () => client.update(id, patch),
            fallback: "That edit wasn't saved. Check your connection and try again.",
          })
          .then((result) => {
            report(result);
            return result.ok;
          }),
      setStage: (id, stage) => {
        // Re-selecting the current stage is a no-op all the way down: no request, no entry.
        const current = jobs.find((job) => job.id === id);
        if (!current || current.stage === stage) return false;
        void cache
          .update(id, {
            apply: (job) => movedJob(job, stage, todayUtc(), optimisticId),
            send: () => client.setStage(id, stage),
            fallback: "That stage change wasn't saved. Check your connection and try again.",
          })
          .then(report);
        return true;
      },
      removeJob: (id) =>
        cache
          .remove(id, {
            send: () => client.remove(id).then(() => undefined),
            fallback: "That job wasn't deleted. Check your connection and try again.",
          })
          .then((result) => {
            report(result);
            return result.ok;
          }),
      error,
      dismissError: () => setError(null),
      reload: () => void refetch(),
      redirectFor: cache.redirectFor,
    }),
    [jobs, status, cache, client, report, error, refetch, queryClient],
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs(): JobsContextValue {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error("useJobs must be used inside <JobsProvider>");
  }
  return context;
}
