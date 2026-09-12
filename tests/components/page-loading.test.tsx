import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { ContactLoading, PageLoading } from "@/components/page-loading";
import { LoadingTrail } from "@/components/loading-trail";
import { SessionProvider } from "@/components/session-provider";
import { contactsCache } from "@/lib/contacts-client";
import { STAGES, STAGE_META } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import { SEED_JOBS } from "../fixtures/jobs";
import { TEST_USER, createTestQueryClient } from "../test-utils";

/**
 * The loading state a navigation shows at once, before the server has answered. It is shaped by
 * where the user is going, and it shows what the browser already knows about the destination.
 */

let pathname = "/board";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSelectedLayoutSegment: () => null,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

function renderLoading(ui: React.ReactElement, queryClient = createTestQueryClient()) {
  return render(
    <SessionProvider user={TEST_USER}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SessionProvider>,
  );
}

describe("the wait itself", () => {
  it("is one status region: the message, with the trail marker hidden from assistive tech", () => {
    render(<LoadingTrail>Loading your trail…</LoadingTrail>);

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Loading your trail…");
    expect(region.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the board", () => {
  it("lays out the five stage columns and says what is loading", () => {
    pathname = "/board";
    renderLoading(<PageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your trail…");
    for (const stage of STAGES) {
      expect(screen.getByText(STAGE_META[stage].label)).toBeInTheDocument();
    }
    // The page's own heading has not arrived; nothing here pretends it has.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("has no structural violations", async () => {
    pathname = "/board";
    const { container } = renderLoading(<PageLoading />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("a Job's page", () => {
  it("shows the Job's name and company at once when the browser already holds it", () => {
    const job = SEED_JOBS[1];
    pathname = `/board/${job.id}`;
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(jobsCache.key, SEED_JOBS);
    renderLoading(<PageLoading />, queryClient);

    expect(screen.getByText(job.role)).toBeInTheDocument();
    expect(screen.getByText(`${job.company} · ${job.location}`)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading this job…");
    // As text, not as the page's heading: the heading is the page's to render.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // The way back is live while the page loads. The nav also links to the board; the first link
    // in the banner is the way back.
    expect(screen.getAllByRole("link", { name: "Board" })[0]).toHaveAttribute("href", "/board");
  });

  it("shows a placeholder for a Job the browser has not seen", () => {
    pathname = "/board/not-cached";
    renderLoading(<PageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading this job…");
    expect(screen.getAllByRole("link", { name: "Board" })[0]).toHaveAttribute("href", "/board");
  });

  it("has no structural violations", async () => {
    pathname = `/board/${SEED_JOBS[0].id}`;
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(jobsCache.key, SEED_JOBS);
    const { container } = renderLoading(<PageLoading />, queryClient);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("Contacts", () => {
  const contacts = [
    { id: "c1", name: "Priya Natarajan", kind: "recruiter" as const, title: "", agency: "Northbound", jobCount: 2 },
    { id: "c2", name: "Sam Okafor", kind: "hiring_manager" as const, title: "Head of Design", agency: "", jobCount: 1 },
  ];

  it("the list page says what is loading", () => {
    pathname = "/contacts";
    renderLoading(<PageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your contacts…");
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("a Contact's page shows their name at once when the list is already in the browser", () => {
    pathname = "/contacts/c2";
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(contactsCache.listKey, contacts);
    renderLoading(<PageLoading />, queryClient);

    expect(screen.getByText("Sam Okafor")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading this contact…");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("the detail side alone, for a move between Contacts inside the list's layout", () => {
    pathname = "/contacts/c1";
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(contactsCache.listKey, contacts);
    renderLoading(<ContactLoading />, queryClient);

    expect(screen.getByText("Priya Natarajan")).toBeInTheDocument();
    expect(screen.getByText("Recruiter · Northbound")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading this contact…");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("the detail side on the list's own URL waits for the page, not for a Contact", () => {
    pathname = "/contacts";
    renderLoading(<ContactLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your contacts…");
  });

  it("has no structural violations", async () => {
    pathname = "/contacts/c1";
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(contactsCache.listKey, contacts);
    const { container } = renderLoading(<PageLoading />, queryClient);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("Documents", () => {
  it("says what is loading", () => {
    pathname = "/documents";
    renderLoading(<PageLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your documents…");
  });

  it("has no structural violations", async () => {
    pathname = "/documents";
    const { container } = renderLoading(<PageLoading />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
