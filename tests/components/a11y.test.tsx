import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";

import LandingPage from "@/app/page";
import { AuthForm } from "@/components/auth/auth-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { BoardView } from "@/components/board/board-view";
import { JobDetail } from "@/components/job/job-detail";
import { renderWithJobs } from "../test-utils";

const idle = async () => ({ status: "idle" as const });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/board",
  useSelectedLayoutSegment: () => null,
}));

/**
 * jsdom computes no styles, so axe cannot judge contrast here — that check runs
 * against real rendering in `e2e/a11y.spec.ts`. What this level catches is
 * structure: labels, names, roles, and relationships.
 */
const AXE_OPTIONS = {
  rules: { "color-contrast": { enabled: false } },
} as const;

describe("A11Y-1: no structural violations", () => {
  it("landing", async () => {
    const { container } = render(<LandingPage />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("signup", async () => {
    const { container } = render(
      <AuthForm mode="signup" action={idle} resendAction={idle} />,
    );
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("login", async () => {
    const { container } = render(
      <AuthForm mode="login" action={idle} resendAction={idle} />,
    );
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("forgot password", async () => {
    const { container } = render(<ForgotPasswordForm action={idle} notice="A notice." />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("reset password", async () => {
    const { container } = render(<ResetPasswordForm action={idle} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("board", async () => {
    const { container } = renderWithJobs(<BoardView />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("board with a card's Move to menu open", async () => {
    const { user } = renderWithJobs(<BoardView />);
    await user.click(screen.getAllByRole("button", { name: /^Move / })[0]);
    await screen.findByRole("menu");

    // Radix portals the menu to <body>, outside every landmark, which the region rule reads as
    // stray page content. It is a popover, not content; the other rules still judge it.
    const options = { rules: { ...AXE_OPTIONS.rules, region: { enabled: false } } };
    expect(await axe(document.body, options)).toHaveNoViolations();
  });

  it("board with the add-job dialog open", async () => {
    const { user } = renderWithJobs(<BoardView />);
    await user.click(screen.getByRole("button", { name: /add job/i }));

    expect(await axe(document.body, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("job detail", async () => {
    const { container } = renderWithJobs(
      <JobDetail jobId="harvest-lead-product-designer" />,
    );
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("job detail, unknown id", async () => {
    const { container } = renderWithJobs(<JobDetail jobId="nope" />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("A11Y-4: decorative graphics carry no unique information", () => {
  it("hides the company initial tile, keeping the company name as text", () => {
    renderWithJobs(<BoardView />);

    const card = screen
      .getByRole("link", { name: "Senior Product Designer" })
      .closest("li")!;
    const tile = within(card).getByText("M", { selector: "span" });

    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(within(card).getByText("Meridian Labs")).toBeInTheDocument();
  });

  it("hides every stage dot, keeping the stage name as text", () => {
    renderWithJobs(<BoardView />);

    const column = screen.getByRole("region", { name: "Offer" });
    const heading = within(column).getByRole("heading", { level: 2 });
    const dot = heading.previousElementSibling!;

    // The dot sits immediately before the label and carries only colour, so
    // the stage survives being read aloud or viewed without hue perception.
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot.textContent).toBe("");
    expect(heading).toHaveTextContent("Offer");
  });

  it("exposes the column count to screen readers as words, not a bare digit", () => {
    renderWithJobs(<BoardView />);

    const column = screen.getByRole("region", { name: "Interested" });
    expect(within(column).getByText("1 application")).toBeInTheDocument();
  });
});

describe("A11Y-5: every control has a programmatic label", () => {
  it("names the paired salary inputs individually", () => {
    renderWithJobs(<JobDetail jobId="harvest-lead-product-designer" />);

    expect(
      screen.getByLabelText("Minimum salary expectation, in thousands"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Maximum salary expectation, in thousands"),
    ).toBeInTheDocument();
  });

  it("names the stage select", () => {
    renderWithJobs(<JobDetail jobId="harvest-lead-product-designer" />);

    expect(
      screen.getByRole("combobox", { name: "Application stage" }),
    ).toBeInTheDocument();
  });

  it("names the icon-only account button", () => {
    renderWithJobs(<BoardView />);

    expect(
      screen.getByRole("button", { name: /Account menu for Sam Rivera/ }),
    ).toBeInTheDocument();
  });

  it("names every textbox on the detail page", () => {
    renderWithJobs(<JobDetail jobId="harvest-lead-product-designer" />);

    for (const box of screen.getAllByRole("textbox")) {
      expect(box).toHaveAccessibleName();
    }
  });
});
