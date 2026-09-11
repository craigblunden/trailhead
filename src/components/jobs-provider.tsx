"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { SEED_JOBS, type Job, type Stage } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import {
  createFixtureJobsClient,
  type JobPatch,
  type JobsClient,
  type NewJobInput,
} from "@/lib/jobs-client";
import { OPENING_ACTIVITY_LABEL, nextAccent, stageChange } from "@/lib/jobs-rules";

export type { JobPatch, NewJobInput };

export type JobsStatus = "pending" | "error" | "success";

type JobsContextValue = {
  jobs: Job[];
  status: JobsStatus;
  getJob: (id: string) => Job | undefined;
  addJob: (input: NewJobInput) => void;
  updateJob: (id: string, patch: JobPatch) => void;
  setStage: (id: string, stage: Stage) => void;
  /** The most recent mutation failure, already rolled back. Null when there is none. */
  error: string | null;
  dismissError: () => void;
  /** Refetches the list — the recovery from a failed load. */
  reload: () => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

const defaultClient: JobsClient = createFixtureJobsClient(SEED_JOBS);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Optimistic ids are stamped so a stray one is recognisable in a bug report. */
function optimisticId(): string {
  return `optimistic-${crypto.randomUUID()}`;
}

/**
 * Job state lives in TanStack Query. The server prefetches the list under `jobsCache.key` and
 * this component reads the same key, so hydration hands the client a warm cache. What TanStack
 * buys over the Phase-1 `useState`: refetch on window focus and on reconnect (a tracker left open
 * overnight no longer shows stale data), and retry with backoff on the read path. Deduplication
 * and shared state were already there.
 *
 * Every mutation is optimistic and runs through TanStack's mutation lifecycle: `onMutate` applies
 * the Phase-1 rules to the cache immediately, `onError` restores the snapshot and surfaces the
 * failure, `onSuccess` replaces the guess with what the server actually wrote.
 */
export function JobsProvider({
  children,
  client = defaultClient,
}: {
  children: React.ReactNode;
  /** Where jobs come from and go to. Defaults to the fixture client until a server exists. */
  client?: JobsClient;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery(jobsCache.options(() => client.list()));
  const jobs = useMemo(() => query.data ?? [], [query.data]);

  const snapshot = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: jobsCache.key });
    return queryClient.getQueryData<Job[]>(jobsCache.key);
  }, [queryClient]);

  const restore = useCallback(
    (previous: Job[] | undefined, message: string) => {
      queryClient.setQueryData<Job[]>(jobsCache.key, previous);
      setError(message);
    },
    [queryClient],
  );

  const patchCache = useCallback(
    (id: string, mutate: (job: Job) => Job) => {
      queryClient.setQueryData<Job[]>(jobsCache.key, (current = []) =>
        current.map((job) => (job.id === id ? mutate(job) : job)),
      );
    },
    [queryClient],
  );

  const add = useMutation({
    mutationFn: (input: NewJobInput) => client.add(input),
    onMutate: async (input) => {
      const previous = await snapshot();
      const addedOn = today();
      const optimistic: Job = {
        ...input,
        id: optimisticId(),
        stage: "interested",
        addedOn,
        appliedOn: null,
        notes: "",
        contacts: [],
        activity: [{ id: optimisticId(), label: OPENING_ACTIVITY_LABEL, date: addedOn }],
        accent: nextAccent(previous?.length ?? 0),
      };
      queryClient.setQueryData<Job[]>(jobsCache.key, (current = []) => [...current, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      restore(context?.previous, "That job wasn't saved. Check your connection and try again.");
    },
    onSuccess: (saved, _input, context) => {
      patchCache(context.optimisticId, () => saved);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: JobPatch }) => client.update(id, patch),
    onMutate: async ({ id, patch }) => {
      const previous = await snapshot();
      patchCache(id, (job) => ({ ...job, ...patch }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      restore(context?.previous, "That edit wasn't saved. Check your connection and try again.");
    },
  });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => client.setStage(id, stage),
    onMutate: async ({ id, stage }) => {
      const previous = await snapshot();
      patchCache(id, (job) => {
        const change = stageChange(job, stage, today());
        if (!change.entry) return job;
        return {
          ...job,
          stage: change.stage,
          appliedOn: change.appliedOn,
          activity: [{ id: optimisticId(), ...change.entry }, ...job.activity],
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      restore(
        context?.previous,
        "That stage change wasn't saved. Check your connection and try again.",
      );
    },
    onSuccess: (saved) => {
      patchCache(saved.id, () => saved);
    },
  });

  const status: JobsStatus = query.status;
  const { mutate: mutateAdd } = add;
  const { mutate: mutateUpdate } = update;
  const { mutate: mutateMove } = move;
  const { refetch } = query;

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      status,
      getJob: (id) => jobs.find((job) => job.id === id),
      addJob: (input) => mutateAdd(input),
      updateJob: (id, patch) => mutateUpdate({ id, patch }),
      setStage: (id, stage) => {
        // Re-selecting the current stage is a no-op all the way down: no request, no entry.
        const current = jobs.find((job) => job.id === id);
        if (!current || current.stage === stage) return;
        mutateMove({ id, stage });
      },
      error,
      dismissError: () => setError(null),
      reload: () => void refetch(),
    }),
    [jobs, status, mutateAdd, mutateUpdate, mutateMove, error, refetch],
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
