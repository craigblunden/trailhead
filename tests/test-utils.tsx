import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { JobsProvider } from "@/components/jobs-provider";
import type { Job } from "@/lib/jobs";

/** The clock every date-sensitive test runs against (spec T-3). */
export const FROZEN_NOW = new Date("2026-07-25T12:00:00Z");
export const FROZEN_ISO = "2026-07-25";

/**
 * Freezes only `Date`, leaving timers real so user-event and Radix's
 * open/close transitions behave normally.
 */
export function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
}

type Options = Omit<RenderOptions, "wrapper"> & { initialJobs?: Job[] };

/** Renders inside the job store, and hands back a bound user-event instance. */
export function renderWithJobs(
  ui: React.ReactElement,
  { initialJobs, ...options }: Options = {},
) {
  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }) => (
        <JobsProvider initialJobs={initialJobs}>{children}</JobsProvider>
      ),
      ...options,
    }),
  };
}

export * from "@testing-library/react";
export { userEvent };
