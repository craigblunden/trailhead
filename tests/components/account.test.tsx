import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { ActionError } from "@/components/action-client";
import { AccountView } from "@/components/account/account-view";
import { PlanComparison } from "@/components/account/plan-comparison";
import type { AccountSummary } from "@/lib/account";
import type { QuotaStatus } from "@/lib/generation";
import type { InterviewQuotaStatus } from "@/lib/interview";
import { ALREADY_REQUESTED, PLANS, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { createTrail } from "../fakes/trail";
import { renderWithJobs, screen, waitFor, within } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/account",
  useSelectedLayoutSegment: () => null,
}));

const account = vi.hoisted(() => ({
  summary: vi.fn(),
  letters: vi.fn(),
  interviews: vi.fn(),
  requestUpgrade: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/components/account/account-actions-client", () => ({ accountClient: account }));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const SUMMARY: AccountSummary = {
  name: "Sam Rivera",
  email: "sam.rivera@example.com",
  providers: ["email", "google"],
  plan: "free",
  upgradeRequest: null,
  jobs: 12,
  documents: 2,
  contacts: 8,
};

const letters = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  limit: 5,
  used: 1,
  remaining: 4,
  resetsOn: "2026-07-27",
  flags: 0,
  held: false,
  ...overrides,
});

const interviews = (overrides: Partial<InterviewQuotaStatus> = {}): InterviewQuotaStatus => ({
  limit: 10,
  used: 1,
  remaining: 9,
  resetsOn: "2026-07-27",
  ...overrides,
});

const PLAN_NAMES: Record<Plan, string> = { free: "Free plan", basic: "Basic plan", pro: "Pro plan" };

beforeEach(() => {
  account.summary.mockResolvedValue(SUMMARY);
  account.letters.mockResolvedValue(letters());
  // Cleared, not just re-stubbed: PAGE-10 holds that a locked Plan never reads the count.
  account.interviews.mockClear().mockResolvedValue(interviews());
  account.remove.mockReset();
  account.requestUpgrade.mockReset().mockResolvedValue({ plan: "basic", requestedAt: new Date("2026-09-22") });
});

/** The summary as it reads for a Tenant on `plan`, with no Upgrade request outstanding. */
const on = (plan: Plan): AccountSummary => ({ ...SUMMARY, plan });

describe("the Plans coming-soon section (account issue 05)", () => {
  const column = (plan: Plan) => screen.getByRole("listitem", { name: PLAN_NAMES[plan] });

  it("PAGE-1: each Plan shows its Limits from PLAN_LIMITS, and an unlimited one reads Unlimited", () => {
    renderWithJobs(<PlanComparison summary={on("free")} />);

    for (const plan of PLANS) {
      const { documents, lettersPerWeek } = PLAN_LIMITS[plan];
      const text = (limit: number | "unlimited") => (limit === "unlimited" ? "Unlimited" : String(limit));
      expect(within(column(plan)).getByText("Documents on file").nextElementSibling).toHaveTextContent(text(documents));
      expect(within(column(plan)).getByText("Cover letters a week").nextElementSibling).toHaveTextContent(
        text(lettersPerWeek),
      );
      // The interview lengths each Plan chooses between (interview second pass ticket 04).
      expect(within(column(plan)).getByText("Interview lengths").nextElementSibling).toHaveTextContent(
        `${PLAN_LIMITS[plan].interviewLengths.join(", ")} min`,
      );
    }
    expect(within(column("pro")).getByText("Unlimited")).toBeInTheDocument();
  });

  it("PAGE-2: only the current Plan is marked", () => {
    renderWithJobs(<PlanComparison summary={on("basic")} />);

    expect(within(column("basic")).getByText("Your plan")).toBeInTheDocument();
    expect(within(column("free")).queryByText("Your plan")).toBeNull();
    expect(within(column("pro")).queryByText("Your plan")).toBeNull();
  });

  it("PAGE-3: says paying is coming soon and asking is the way, and the ask is the only control", () => {
    // Was "nothing in it can be focused". Upgrade requests (ADR-0009) give the section exactly one
    // control — the ask — and still no price, no link and no checkout.
    const { container } = renderWithJobs(<PlanComparison summary={on("free")} />);

    expect(
      screen.getByText("Paying for a plan is coming soon — until then, ask and I’ll move you across by hand."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("a, input, select, textarea, [tabindex]")).toHaveLength(0);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Ask to upgrade to Basic"]);
  });

  it("PAGE-3b: on the top Plan the section offers nothing to ask for", () => {
    renderWithJobs(<PlanComparison summary={on("pro")} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("PAGE-4: no Limit is written into the component: every number comes from PLAN_LIMITS", () => {
    const source = readFileSync(join(process.cwd(), "src/components/account/plan-comparison.tsx"), "utf8");
    const numbers = new Set(
      PLANS.flatMap((plan) => Object.values(PLAN_LIMITS[plan])).filter((limit) => typeof limit === "number"),
    );
    for (const limit of numbers) {
      // A number that is part of a class name (`gap-3`, `ring-foreground/10`) is not a Limit.
      expect(source, `the literal ${limit}`).not.toMatch(new RegExp(`(?<![\\w.:/-])${limit}(?![\\w.:/-])`));
    }
    expect(source.toLowerCase()).not.toMatch(/tier|subscription|premium/);
  });
});

describe("the account page (account issue 05)", () => {
  it("PAGE-5: names who is signed in and every way they sign in", async () => {
    renderWithJobs(<AccountView />);

    const section = await screen.findByRole("region", { name: "Your account" });
    expect(within(section).getByText("Sam Rivera")).toBeInTheDocument();
    expect(within(section).getByText("sam.rivera@example.com")).toBeInTheDocument();
    expect(within(section).getByText("Email and password, Google")).toBeInTheDocument();
  });

  it("PAGE-6: shows the Plan, Documents held against the Limit, and letters left this week", async () => {
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "free" }) });

    const section = await screen.findByRole("region", { name: "Your plan" });
    expect(within(section).getByText("Free plan")).toBeInTheDocument();
    expect(await within(section).findByText("2 of 3 documents")).toBeInTheDocument();
    expect(within(section).getByText("4 of 5 cover letters left this week")).toBeInTheDocument();
  });

  it("PAGE-7: under an unlimited Documents Limit it counts, and on Hold it says letters are paused", async () => {
    account.summary.mockResolvedValue({ ...SUMMARY, plan: "pro", documents: 14 });
    account.letters.mockResolvedValue(letters({ limit: 25, remaining: 20, used: 5, flags: 2, held: true }));
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "pro" }) });

    const section = await screen.findByRole("region", { name: "Your plan" });
    expect(await within(section).findByText("14 documents")).toBeInTheDocument();
    expect(within(section).getByText("Cover letters are paused until Monday, Jul 27")).toBeInTheDocument();
  });

  const row = (section: HTMLElement, term: string) => within(section).getByText(term).nextElementSibling;

  it("PAGE-9: on Pro, the interviews left this week and the lengths it may choose between", async () => {
    account.summary.mockResolvedValue({ ...SUMMARY, plan: "pro" });
    account.interviews.mockResolvedValue(interviews({ limit: 10, used: 3, remaining: 7 }));
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "pro" }) });

    const section = await screen.findByRole("region", { name: "Your plan" });
    expect(await within(section).findByText("7 of 10 interviews left this week")).toBeInTheDocument();
    await waitFor(() => expect(row(section, "Interview lengths")).toHaveTextContent("15, 20, or 30 minutes"));
  });

  it.each(["free", "basic"] as const)(
    "PAGE-10: on %s, interviews are named a Pro feature, with no count and no lengths",
    async (plan) => {
      account.summary.mockResolvedValue({ ...SUMMARY, plan });
      renderWithJobs(<AccountView />, { trail: createTrail({ plan }) });

      const section = await screen.findByRole("region", { name: "Your plan" });
      expect(row(section, "Interviews")).toHaveTextContent("The Interview Simulator is a Pro feature");
      expect(within(section).queryByText("Interview lengths")).toBeNull();
      expect(within(section).queryByText(/interviews left this week/)).toBeNull();
      expect(account.interviews).not.toHaveBeenCalled();
    },
  );

  it("PAGE-11: on Pro, a failed interviews read says so", async () => {
    account.summary.mockResolvedValue({ ...SUMMARY, plan: "pro" });
    account.interviews.mockRejectedValue(new Error("down"));
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "pro" }) });

    const section = await screen.findByRole("region", { name: "Your plan" });
    expect(await within(section).findByText("We couldn’t check your interviews.")).toBeInTheDocument();
  });

  it("PAGE-8: one h1, the four sections in order, and no axe violations", async () => {
    const { container } = renderWithJobs(<AccountView />);

    await screen.findByText("2 of 3 documents");
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Account"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Your account",
      "Your plan",
      "Plans — coming soon",
      "Delete account",
    ]);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("the Delete account dialog (account issue 06)", () => {
  async function openDialog(summary: Partial<AccountSummary> = {}) {
    account.summary.mockResolvedValue({ ...SUMMARY, ...summary });
    const rendered = renderWithJobs(<AccountView />);
    const section = await screen.findByRole("region", { name: "Delete account" });
    await rendered.user.click(within(section).getByRole("button", { name: "Delete account…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
    return { ...rendered, dialog };
  }

  const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /^(Delete my account|Deleting your account…)$/ });
  const emailField = (dialog: HTMLElement) =>
    within(dialog).getByRole("textbox", { name: `Type ${SUMMARY.email} to confirm` });

  it("DLG-1: lists what goes with its counts, points at Documents, and says what cannot be recalled or undone", async () => {
    const { dialog } = await openDialog();

    expect(dialog).toHaveTextContent("12 jobs, 2 documents, and 8 contacts — with their history, notes, and drafts.");
    expect(within(dialog).getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/documents");
    expect(dialog).toHaveTextContent("Want your files? Download them from Documents first.");
    expect(dialog).toHaveTextContent("Feedback you’ve already sent us isn’t recalled.");
    expect(dialog).toHaveTextContent("This can’t be undone.");
  });

  it("DLG-2: counts pluralise", async () => {
    const { dialog } = await openDialog({ jobs: 1, documents: 1, contacts: 1 });
    expect(dialog).toHaveTextContent("1 job, 1 document, and 1 contact — with their history, notes, and drafts.");
  });

  it.each([
    ["free", null],
    ["basic", "Your Basic plan ends with your account."],
    ["pro", "Your Pro plan ends with your account."],
  ] as const)("DLG-3: on %s the Plan line is %s", async (plan, line) => {
    const { dialog } = await openDialog({ plan });
    if (line) expect(dialog).toHaveTextContent(line);
    else expect(dialog).not.toHaveTextContent(/plan ends with your account/);
  });

  it("DLG-4: the button stays disabled until the Account's email is typed — any case, spaces around it", async () => {
    const { user, dialog } = await openDialog();

    expect(confirmButton(dialog)).toBeDisabled();
    await user.type(emailField(dialog), "sam.rivera@example.co");
    expect(confirmButton(dialog)).toBeDisabled();

    await user.clear(emailField(dialog));
    await user.type(emailField(dialog), "  SAM.Rivera@Example.com ");
    expect(confirmButton(dialog)).toBeEnabled();
  });

  it("DLG-5: while deleting, the button shows the wait, the dialog cannot be dismissed, and it cannot be sent twice", async () => {
    // Settled before the test ends: React entangles every transition with a pending async one.
    let settle = () => {};
    account.remove.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));
    const { user, dialog } = await openDialog();

    await user.type(emailField(dialog), SUMMARY.email);
    await user.click(confirmButton(dialog));

    expect(confirmButton(dialog)).toHaveTextContent("Deleting your account…");
    expect(confirmButton(dialog)).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Keep my account" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument();

    await user.click(confirmButton(dialog));
    expect(account.remove).toHaveBeenCalledTimes(1);
    expect(account.remove).toHaveBeenCalledWith(SUMMARY.email);

    settle();
    await waitFor(() => expect(confirmButton(dialog)).toHaveTextContent("Delete my account"));
  });

  it("DLG-6: a refusal is shown inside the dialog, and what was typed is kept", async () => {
    account.remove.mockResolvedValue({
      ok: false,
      error: "failed",
      code: "storage",
      message: "We couldn't delete your files, so nothing was deleted. Please try again.",
    });
    const { user, dialog } = await openDialog();

    await user.type(emailField(dialog), SUMMARY.email);
    await user.click(confirmButton(dialog));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "We couldn't delete your files, so nothing was deleted. Please try again.",
    );
    expect(emailField(dialog)).toHaveValue(SUMMARY.email);
    await waitFor(() => expect(confirmButton(dialog)).toBeEnabled());
  });

  it("DLG-7: the open dialog has no axe violations", async () => {
    const { dialog } = await openDialog({ plan: "pro" });
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("asking to upgrade (upgrade-requests ticket 04, ADR-0009)", () => {
  const ask = (section: HTMLElement) => within(section).getByRole("button", { name: /^(Ask to upgrade|Upgrade requested)/ });

  it("REQ-14: a free Tenant is offered basic, in Your plan and again beside the plans", async () => {
    renderWithJobs(<AccountView />);

    const plan = await screen.findByRole("region", { name: "Your plan" });
    const plans = await screen.findByRole("region", { name: "Plans — coming soon" });
    expect(ask(plan)).toHaveTextContent("Ask to upgrade to Basic");
    expect(ask(plans)).toHaveTextContent("Ask to upgrade to Basic");
  });

  it("REQ-15: a basic Tenant is offered pro", async () => {
    account.summary.mockResolvedValue({ ...SUMMARY, plan: "basic" });
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "basic" }) });

    const plan = await screen.findByRole("region", { name: "Your plan" });
    expect(ask(plan)).toHaveTextContent("Ask to upgrade to Pro");
  });

  it("REQ-16: a pro Tenant is offered nothing — there is nothing above it", async () => {
    account.summary.mockResolvedValue({ ...SUMMARY, plan: "pro" });
    renderWithJobs(<AccountView />, { trail: createTrail({ plan: "pro" }) });

    const plan = await screen.findByRole("region", { name: "Your plan" });
    expect(within(plan).queryByRole("button", { name: /upgrade/i })).toBeNull();
  });

  it("REQ-17: with a request outstanding the button is disabled and says so, before anything is clicked", async () => {
    account.summary.mockResolvedValue({
      ...SUMMARY,
      upgradeRequest: { plan: "basic", requestedAt: new Date("2026-09-20") },
    });
    renderWithJobs(<AccountView />);

    const plan = await screen.findByRole("region", { name: "Your plan" });
    expect(ask(plan)).toBeDisabled();
    expect(ask(plan)).toHaveTextContent("Upgrade requested — I’ll be in touch");
    expect(account.requestUpgrade).not.toHaveBeenCalled();
  });

  it("REQ-18: asking sends nothing to the server and leaves the button disabled", async () => {
    const rendered = renderWithJobs(<AccountView />);
    const plan = await screen.findByRole("region", { name: "Your plan" });

    await rendered.user.click(ask(plan));

    // The client names no Plan: the server reads the Tenant's own and derives the next one up.
    expect(account.requestUpgrade).toHaveBeenCalledWith();
    await waitFor(() => expect(ask(plan)).toBeDisabled());
    expect(ask(plan)).toHaveTextContent("Upgrade requested — I’ll be in touch");
  });

  it("REQ-19: a refusal is shown in the rule's own words rather than swallowed", async () => {
    account.requestUpgrade.mockRejectedValue(new ActionError("rejected", ALREADY_REQUESTED, {}, "already-requested"));
    const rendered = renderWithJobs(<AccountView />);
    const plan = await screen.findByRole("region", { name: "Your plan" });

    await rendered.user.click(ask(plan));

    expect(await within(plan).findByRole("alert")).toHaveTextContent(ALREADY_REQUESTED);
  });
});
