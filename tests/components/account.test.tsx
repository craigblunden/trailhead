import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { AccountView } from "@/components/account/account-view";
import { PlanComparison } from "@/components/account/plan-comparison";
import type { AccountSummary } from "@/lib/account";
import type { QuotaStatus } from "@/lib/generation";
import { PLANS, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { createTrail } from "../fakes/trail";
import { render, renderWithJobs, screen, waitFor, within } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/account",
  useSelectedLayoutSegment: () => null,
}));

const account = vi.hoisted(() => ({
  summary: vi.fn(),
  letters: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/components/account/account-actions-client", () => ({ accountClient: account }));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const SUMMARY: AccountSummary = {
  name: "Sam Rivera",
  email: "sam.rivera@example.com",
  providers: ["email", "google"],
  plan: "free",
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

const PLAN_NAMES: Record<Plan, string> = { free: "Free plan", basic: "Basic plan", pro: "Pro plan" };

beforeEach(() => {
  account.summary.mockResolvedValue(SUMMARY);
  account.letters.mockResolvedValue(letters());
  account.remove.mockReset();
});

describe("the Plans coming-soon section (account issue 05)", () => {
  const column = (plan: Plan) => screen.getByRole("listitem", { name: PLAN_NAMES[plan] });

  it("PAGE-1: each Plan shows its Limits from PLAN_LIMITS, and an unlimited one reads Unlimited", () => {
    render(<PlanComparison current="free" />);

    for (const plan of PLANS) {
      const { documents, lettersPerWeek } = PLAN_LIMITS[plan];
      const text = (limit: number | "unlimited") => (limit === "unlimited" ? "Unlimited" : String(limit));
      expect(within(column(plan)).getByText("Documents on file").nextElementSibling).toHaveTextContent(text(documents));
      expect(within(column(plan)).getByText("Cover letters a week").nextElementSibling).toHaveTextContent(
        text(lettersPerWeek),
      );
    }
    expect(within(column("pro")).getByText("Unlimited")).toBeInTheDocument();
  });

  it("PAGE-2: only the current Plan is marked", () => {
    render(<PlanComparison current="basic" />);

    expect(within(column("basic")).getByText("Your plan")).toBeInTheDocument();
    expect(within(column("free")).queryByText("Your plan")).toBeNull();
    expect(within(column("pro")).queryByText("Your plan")).toBeNull();
  });

  it("PAGE-3: says paying is coming soon, and nothing in it can be focused", () => {
    const { container } = render(<PlanComparison current="free" />);

    expect(screen.getByText("Paying for a plan is coming soon.")).toBeInTheDocument();
    expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
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
