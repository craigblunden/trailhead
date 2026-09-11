import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ContactsProvider } from "@/components/contacts/contacts-provider";
import { DocumentsProvider } from "@/components/documents/documents-provider";
import { JobsProvider } from "@/components/jobs-provider";
import { SessionProvider } from "@/components/session-provider";
import type { Job } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import type { JobsClient } from "@/lib/jobs-client";
import { createTrail, type Trail } from "./fakes/trail";
import { SEED_JOBS } from "./fixtures/jobs";

/** The signed-in user every board test renders as. */
export const TEST_USER = { name: "Sam Rivera", email: "sam.rivera@example.com" };

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

/** A query client that fails fast and keeps nothing between tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

type Options = Omit<RenderOptions, "wrapper"> & {
  /** The Jobs the store starts with, when no `trail` is given. */
  initialJobs?: Job[];
  /** The one in-memory store behind the jobs, contacts, and documents clients. */
  trail?: Trail;
  /** Replaces the store's jobs client — e.g. one whose writes reject. */
  client?: JobsClient;
  /** Set false to leave the cache empty, so the provider has to fetch (loading and error states). */
  seedCache?: boolean;
};

/**
 * Renders inside the job store, and hands back a bound user-event instance and the store.
 *
 * The cache is seeded with the store's Jobs before the first render, which is what hydration does
 * in the real app: the board never shows a loading state in these tests unless a test asks for one.
 */
export function renderWithJobs(
  ui: React.ReactElement,
  { initialJobs = SEED_JOBS, trail, client, seedCache = true, ...options }: Options = {},
) {
  const queryClient = createTestQueryClient();
  const store = trail ?? createTrail({ jobs: initialJobs });
  if (seedCache) queryClient.setQueryData(jobsCache.key, store.jobsNow());

  return {
    user: userEvent.setup(),
    queryClient,
    trail: store,
    ...render(ui, {
      wrapper: ({ children }) => (
        <SessionProvider user={TEST_USER}>
          <QueryClientProvider client={queryClient}>
            <ContactsProvider client={store.contacts}>
              <DocumentsProvider client={store.documents}>
                <JobsProvider client={client ?? store.jobs}>{children}</JobsProvider>
              </DocumentsProvider>
            </ContactsProvider>
          </QueryClientProvider>
        </SessionProvider>
      ),
      ...options,
    }),
  };
}

export * from "@testing-library/react";
export { userEvent };
