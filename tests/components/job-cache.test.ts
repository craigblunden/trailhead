import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ActionError } from "@/components/action-client";
import { jobCache } from "@/components/job-cache";
import { withKitSlot, type Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import type { JobPatch } from "@/lib/jobs-client";
import { movedJob } from "@/lib/jobs-rules";
import { SEED_JOBS } from "../fixtures/jobs";
import { createTestQueryClient } from "../test-utils";

/**
 * The Job cache module through its interface (architecture ticket 03): a real query client, no
 * rendering, and requests the test settles by hand so the races are the test's to choose.
 */

const HARVEST = "harvest-lead-product-designer";
const FERNWOOD = "fernwood-product-designer-growth";
const MERIDIAN = "meridian-senior-product-designer";
const harvest = SEED_JOBS.find((job) => job.id === HARVEST)!;
const meridian = SEED_JOBS.find((job) => job.id === MERIDIAN)!;
const fernwood = SEED_JOBS.find((job) => job.id === FERNWOOD)!;
const staff = { id: "staff", fileName: "resume_staff_v1.pdf" };

/** A request still on its way, settled when the test says. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(jobsCache.key, [harvest, fernwood, meridian]);
  const list = () => queryClient.getQueryData<Job[]>(jobsCache.key)!;
  const job = (id: string) => list().find((candidate) => candidate.id === id)!;
  return { queryClient, cache: jobCache(queryClient), list, job };
}

describe("a refused write", () => {
  it.each<{ field: "notes" | "description" | "salaryMin"; patch: JobPatch }>([
    { field: "notes", patch: { notes: "Ask about the team" } },
    { field: "description", patch: { description: "Rewritten." } },
    { field: "salaryMin", patch: { salaryMin: 1 } },
  ])("CACHE-1: a refused $field edit restores only that field; a kit choice made meanwhile survives", async ({ field, patch }) => {
    const { cache, job } = setup();
    const edit = deferred<Job>();
    const pick = deferred<Job>();

    const editing = cache.update(HARVEST, {
      apply: (current) => ({ ...current, ...patch }),
      send: () => edit.promise,
      fallback: "That edit wasn't saved.",
    });
    const choosing = cache.update(HARVEST, {
      apply: (current) => withKitSlot(current, "resume", staff),
      send: () => pick.promise,
      fallback: "That change wasn't saved.",
    });
    expect(job(HARVEST)).toMatchObject({ ...patch, resume: staff });

    edit.reject(new Error("503 from the server"));
    expect(await editing).toEqual({ ok: false, message: "That edit wasn't saved." });
    expect(job(HARVEST)[field]).toEqual(harvest[field]);
    expect(job(HARVEST).resume).toEqual(staff);

    pick.resolve(withKitSlot(harvest, "resume", staff));
    expect(await choosing).toMatchObject({ ok: true });
    expect(job(HARVEST).resume).toEqual(staff);
  });

  it("CACHE-2: a refused Stage move restores its Stage, applied date, and Activity; another Job's edit made meanwhile survives", async () => {
    const { cache, job } = setup();
    const move = deferred<Job>();

    expect(meridian).toMatchObject({ stage: "interested", appliedOn: null });
    const moving = cache.update(MERIDIAN, {
      apply: (current) => movedJob(current, "applied", "2026-07-25", () => "entry-1"),
      send: () => move.promise,
      fallback: "That stage change wasn't saved.",
    });
    expect(job(MERIDIAN)).toMatchObject({
      stage: "applied",
      appliedOn: "2026-07-25",
      activity: [{ label: "Moved to Applied" }, ...meridian.activity],
    });
    const editing = await cache.update(FERNWOOD, {
      apply: (current) => ({ ...current, notes: "Screen booked" }),
      send: async () => ({ ...fernwood, notes: "Screen booked" }),
      fallback: "That edit wasn't saved.",
    });
    expect(editing).toMatchObject({ ok: true });

    move.reject(new Error("503 from the server"));
    expect(await moving).toEqual({ ok: false, message: "That stage change wasn't saved." });
    expect(job(MERIDIAN)).toEqual(meridian);
    expect(job(FERNWOOD).notes).toBe("Screen booked");
  });

  it("CACHE-3: a refusal leaves alone a later change to the same field", async () => {
    const { cache, job } = setup();
    const first = deferred<Job>();

    const firstEdit = cache.update(HARVEST, {
      apply: (current) => ({ ...current, notes: "First" }),
      send: () => first.promise,
      fallback: "That edit wasn't saved.",
    });
    const secondEdit = deferred<Job>();
    const second = cache.update(HARVEST, {
      apply: (current) => ({ ...current, notes: "Second" }),
      send: () => secondEdit.promise,
      fallback: "That edit wasn't saved.",
    });

    first.reject(new Error("503 from the server"));
    await firstEdit;
    expect(job(HARVEST).notes).toBe("Second");

    secondEdit.resolve({ ...harvest, notes: "Second" });
    await second;
    expect(job(HARVEST).notes).toBe("Second");
  });

  it("CACHE-4: explains itself with a field's own message, then the action's, then the fallback", async () => {
    const { cache } = setup();
    const refuse = (error: unknown) =>
      cache.update(HARVEST, {
        apply: (current) => ({ ...current, salaryMin: 1.5 }),
        send: () => Promise.reject(error),
        fallback: "That edit wasn't saved.",
      });

    expect(
      await refuse(
        new ActionError("invalid", "Check the highlighted fields.", { salaryMin: "Enter a whole number of thousands" }),
      ),
    ).toEqual({ ok: false, message: "Enter a whole number of thousands" });
    expect(await refuse(new ActionError("not-found", "This job isn't on your trail."))).toEqual({
      ok: false,
      message: "This job isn't on your trail.",
    });
    expect(await refuse(new Error("fetch failed"))).toEqual({ ok: false, message: "That edit wasn't saved." });
  });
});

describe("a write the server accepts", () => {
  it("CACHE-5: swaps in the server's Job, except the fields another write still has on its way", async () => {
    const { cache, job } = setup();
    const pick = deferred<Job>();

    const choosing = cache.update(HARVEST, {
      apply: (current) => withKitSlot(current, "resume", staff),
      send: () => pick.promise,
      fallback: "That change wasn't saved.",
    });
    // The notes save answers first, with the Job as the server has it: no resume attached yet.
    await cache.update(HARVEST, {
      apply: (current) => ({ ...current, notes: "Saved" }),
      send: async () => ({ ...harvest, notes: "Saved" }),
      fallback: "That edit wasn't saved.",
    });
    expect(job(HARVEST).notes).toBe("Saved");
    expect(job(HARVEST).resume).toEqual(staff);

    pick.resolve({ ...harvest, notes: "Saved", resume: staff });
    await choosing;
    expect(job(HARVEST)).toEqual({ ...harvest, notes: "Saved", resume: staff });
  });

  it("CACHE-6: a write that waits for the server — a Contact link — cancels a read in flight before swapping in", async () => {
    const { queryClient, cache, job } = setup();
    const stale = deferred<Job[]>();
    const reading = queryClient
      .fetchQuery({ queryKey: jobsCache.key, queryFn: () => stale.promise, staleTime: 0 })
      .catch(() => null);
    const linked: Job = {
      ...harvest,
      contacts: [
        ...harvest.contacts,
        { id: "priya", name: "Priya Raman", kind: "referrer", title: "", agency: "", email: "", otherJobCount: 0 },
      ],
    };

    expect(await cache.update(HARVEST, { send: async () => linked, fallback: "That change wasn't saved." })).toMatchObject({
      ok: true,
    });
    stale.resolve([harvest, fernwood]);
    await reading;

    expect(job(HARVEST).contacts).toEqual(linked.contacts);
  });

  it("CACHE-7: a new Job shows at once, takes the server's id when saved, and leaves nothing behind when refused", async () => {
    const { cache, list } = setup();
    const ids = () => list().map((job) => job.id);

    const refused = cache.add((jobs) => ({ ...harvest, id: `optimistic-${jobs.length}` }), {
      send: () => Promise.reject(new Error("503 from the server")),
      fallback: "That job wasn't saved.",
    });
    expect(ids()).toEqual([HARVEST, FERNWOOD, MERIDIAN, "optimistic-3"]);
    expect(await refused).toEqual({ ok: false, message: "That job wasn't saved." });
    expect(ids()).toEqual([HARVEST, FERNWOOD, MERIDIAN]);

    const accepted = cache.add(() => ({ ...harvest, id: "optimistic-new" }), {
      send: async () => ({ ...harvest, id: "server-assigned-id" }),
      fallback: "That job wasn't saved.",
    });
    expect(await accepted).toMatchObject({ ok: true });
    expect(ids()).toEqual([HARVEST, FERNWOOD, MERIDIAN, "server-assigned-id"]);
  });
});

describe("resyncing the list", () => {
  it("CACHE-8: happens once, when the last write in flight settles — not while one is on its way", async () => {
    const { queryClient, cache } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const first = deferred<Job>();
    const second = deferred<Job>();

    const a = cache.update(HARVEST, { apply: (job) => ({ ...job, notes: "a" }), send: () => first.promise, fallback: "x" });
    const b = cache.update(FERNWOOD, { apply: (job) => ({ ...job, notes: "b" }), send: () => second.promise, fallback: "x" });
    // A Document deleted meanwhile: its resync waits for the writes.
    cache.refresh();

    first.resolve({ ...harvest, notes: "a" });
    await a;
    expect(invalidate).not.toHaveBeenCalled();

    second.resolve({ ...fernwood, notes: "b" });
    await b;
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: jobsCache.key });

    cache.refresh();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("one writer", () => {
  it("CACHE-9: nothing in src/ but the Job cache module writes, cancels, or resyncs the jobs list", () => {
    const root = join(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name === "generated" ? [] : walk(full);
        return /\.(ts|tsx)$/.test(name) ? [full] : [];
      });

    const offenders = walk(root)
      .map((file) => relative(root, file).split(sep).join("/"))
      .filter((path) => path !== "components/job-cache.ts")
      .filter((path) =>
        /\b(setQueryData|cancelQueries|invalidateQueries|refetchQueries|resetQueries|removeQueries)\b[^;]*jobsCache/.test(
          readFileSync(join(root, path), "utf8"),
        ),
      );

    expect(offenders).toEqual([]);
  });
});
