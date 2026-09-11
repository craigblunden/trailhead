import type { Job, Stage } from "@/lib/jobs";
import { OPENING_ACTIVITY_LABEL, nextAccent, stageChange } from "@/lib/jobs-rules";

/** What the board asks the world for. The provider talks to this and nothing else. */
export type NewJobInput = {
  company: string;
  role: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  postingUrl: string;
  description: string;
};

/**
 * The editable fields: the two free-text panels and the salary expectation the details card
 * already lets the user type into. Anything else on a Job changes only through a dedicated
 * action (stage) or not at all (ticket 11).
 */
export type JobPatch = Partial<Pick<Job, "description" | "notes" | "salaryMin" | "salaryMax">>;

export type JobsClient = {
  list(): Promise<Job[]>;
  add(input: NewJobInput): Promise<Job>;
  update(id: string, patch: JobPatch): Promise<Job>;
  setStage(id: string, stage: Stage): Promise<Job>;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * An in-memory client over fixtures, applying the Phase-1 rules. This is what the board runs
 * against until a server exists, and what component tests drive. Every call resolves on a
 * microtask so consumers experience the same asynchrony the real client will have.
 */
export function createFixtureJobsClient(seed: Job[]): JobsClient {
  let jobs = seed.map((job) => ({ ...job }));

  const find = (id: string) => {
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error("This job isn't on your trail");
    return job;
  };
  const replace = (next: Job) => {
    jobs = jobs.map((job) => (job.id === next.id ? next : job));
    return next;
  };

  return {
    async list() {
      return jobs;
    },
    async add(input) {
      const addedOn = today();
      const job: Job = {
        ...input,
        id: crypto.randomUUID(),
        stage: "interested",
        addedOn,
        appliedOn: null,
        notes: "",
        resume: null,
        coverLetter: null,
        contacts: [],
        activity: [{ id: crypto.randomUUID(), label: OPENING_ACTIVITY_LABEL, date: addedOn }],
        accent: nextAccent(jobs.length),
      };
      jobs = [...jobs, job];
      return job;
    },
    async update(id, patch) {
      return replace({ ...find(id), ...patch });
    },
    async setStage(id, stage) {
      const job = find(id);
      const change = stageChange(job, stage, today());
      if (!change.entry) return job;
      return replace({
        ...job,
        stage: change.stage,
        appliedOn: change.appliedOn,
        activity: [{ id: crypto.randomUUID(), ...change.entry }, ...job.activity],
      });
    },
  };
}
