import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ContactsProvider } from "@/components/contacts/contacts-provider";
import { DocumentsProvider } from "@/components/documents/documents-provider";
import { JobsProvider } from "@/components/jobs-provider";
import { SessionProvider } from "@/components/session-provider";
import type { Job } from "@/lib/jobs";
import { SEED_JOBS } from "./fixtures/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import type { ContactsClient } from "@/lib/contacts-client";
import type { DocumentsClient } from "@/lib/documents-client";
import { createFixtureJobsClient, type JobsClient } from "@/lib/jobs-client";
import { createFakeContactsClient } from "./fakes/contacts-client";
import { createFakeDocumentsClient } from "./fakes/documents-client";

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
  initialJobs?: Job[];
  /** Overrides the fixture client — e.g. one whose mutations reject. */
  client?: JobsClient;
  /** Set false to leave the cache empty, so the provider has to fetch (loading and error states). */
  seedCache?: boolean;
  /** Overrides the in-memory contacts client built over `initialJobs`. */
  contactsClient?: ContactsClient;
  /** Overrides the empty in-memory documents client. */
  documentsClient?: DocumentsClient;
};

/**
 * Renders inside the job store, and hands back a bound user-event instance.
 *
 * The cache is seeded with `initialJobs` before the first render, which is what hydration does in
 * the real app: the board never shows a loading state in these tests unless a test asks for one.
 */
export function renderWithJobs(
  ui: React.ReactElement,
  { initialJobs = SEED_JOBS, client, seedCache = true, contactsClient, documentsClient, ...options }: Options = {},
) {
  const queryClient = createTestQueryClient();
  if (seedCache) queryClient.setQueryData(jobsCache.key, initialJobs);
  const jobsClient = client ?? createFixtureJobsClient(initialJobs);
  const contacts = contactsClient ?? createFakeContactsClient({ jobs: initialJobs });
  const documents = documentsClient ?? createFakeDocumentsClient();

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <SessionProvider user={TEST_USER}>
          <QueryClientProvider client={queryClient}>
            <ContactsProvider client={contacts}>
              <DocumentsProvider client={documents}>
                <JobsProvider client={jobsClient}>{children}</JobsProvider>
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
