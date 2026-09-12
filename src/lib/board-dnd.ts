/**
 * What a card dragged across the board carries: one Job id, under a type of our own. A column
 * accepts only that type, so text or files dragged in from outside the page are never taken for a
 * Job. Each rule is typed against just the part of `DataTransfer` it touches, so the rules run
 * under jsdom (which has no `DataTransfer`) and the tests need no browser.
 */

export const JOB_TRANSFER_TYPE = "application/x-trailhead-job";

type Types = { readonly types: readonly string[] };

export function writeJobTransfer(
  transfer: { effectAllowed: string; setData(type: string, value: string): void },
  jobId: string,
): void {
  transfer.setData(JOB_TRANSFER_TYPE, jobId);
  transfer.effectAllowed = "move";
}

/** True while a Job is being dragged over — the data itself is unreadable until the drop. */
export function carriesJob(transfer: Types): boolean {
  return transfer.types.includes(JOB_TRANSFER_TYPE);
}

/** The Job id a drop carries, or null when it carries no Job. */
export function readJobTransfer(transfer: Types & { getData(type: string): string }): string | null {
  if (!carriesJob(transfer)) return null;
  const jobId = transfer.getData(JOB_TRANSFER_TYPE);
  return jobId === "" ? null : jobId;
}
