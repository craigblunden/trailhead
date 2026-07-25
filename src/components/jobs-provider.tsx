"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  ACCENTS,
  SEED_JOBS,
  STAGE_META,
  type Accent,
  type Job,
  type Stage,
} from "@/lib/jobs";

export type NewJobInput = {
  company: string;
  role: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  postingUrl: string;
  resumeFile: string | null;
  description: string;
};

/** A job's identity is assigned once and never patched. */
export type JobPatch = Partial<Omit<Job, "id">>;

type JobsContextValue = {
  jobs: Job[];
  getJob: (id: string) => Job | undefined;
  addJob: (input: NewJobInput) => void;
  updateJob: (id: string, patch: JobPatch) => void;
  setStage: (id: string, stage: Stage) => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

const ACCENT_KEYS = Object.keys(ACCENTS) as Accent[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * In-memory store for the prototype. Swapping this for a real data layer means
 * replacing the provider body — consumers only see the context shape.
 *
 * `initialJobs` is the seam for that swap, and lets tests drive states the
 * fixtures don't cover (an empty board, a single stage).
 */
export function JobsProvider({
  children,
  initialJobs = SEED_JOBS,
}: {
  children: React.ReactNode;
  initialJobs?: Job[];
}) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  const getJob = useCallback(
    (id: string) => jobs.find((job) => job.id === id),
    [jobs],
  );

  const addJob = useCallback((input: NewJobInput) => {
    setJobs((current) => {
      const addedOn = today();
      const job: Job = {
        ...input,
        id: crypto.randomUUID(),
        stage: "interested",
        addedOn,
        appliedOn: null,
        notes: "",
        contacts: [],
        activity: [
          { id: crypto.randomUUID(), label: "Added to board — Interested", date: addedOn },
        ],
        accent: ACCENT_KEYS[current.length % ACCENT_KEYS.length],
      };
      return [...current, job];
    });
  }, []);

  const updateJob = useCallback((id: string, patch: JobPatch) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  }, []);

  const setStage = useCallback((id: string, stage: Stage) => {
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== id || job.stage === stage) return job;
        const entry = {
          id: crypto.randomUUID(),
          label: `Moved to ${STAGE_META[stage].label}`,
          date: today(),
        };
        return {
          ...job,
          stage,
          // Reaching "Applied" without a date on file backfills one.
          appliedOn: job.appliedOn ?? (stage === "interested" ? null : entry.date),
          activity: [entry, ...job.activity],
        };
      }),
    );
  }, []);

  const value = useMemo(
    () => ({ jobs, getJob, addJob, updateJob, setStage }),
    [jobs, getJob, addJob, updateJob, setStage],
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
