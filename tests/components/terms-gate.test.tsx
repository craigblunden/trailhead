import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { TermsGate } from "@/components/terms/terms-gate";
import { TERMS_VERSION } from "@/lib/terms";
import type { ActionResult } from "@/server/action-result";

import { render, screen, userEvent, waitFor } from "../test-utils";

/**
 * The acceptance gate (terms ticket 04). What matters here is that the control is explicit and
 * unticked, that nothing is recorded until it is ticked, and that declining leads only to signing out.
 */

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

function renderGate(accept: () => Promise<ActionResult<null>> = async () => ({ ok: true, data: null })) {
  const signOut = vi.fn(async () => {});
  return {
    signOut,
    user: userEvent.setup(),
    ...render(<TermsGate version={TERMS_VERSION} accept={accept} signOut={signOut} />),
  };
}

const agreeBox = () => screen.getByRole("checkbox");
const continueButton = () => screen.getByRole("button", { name: /agree and continue/i });

describe("terms ticket 04: the gate", () => {
  it("GATE-1: opens with the box unticked and the submit blocked", () => {
    renderGate();
    expect(agreeBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
  });

  it("GATE-2: says which text goes to which company, before anything is agreed to", () => {
    renderGate();
    expect(screen.getByText(/Anthropic — Cover letters/)).toBeInTheDocument();
    expect(screen.getByText(/TypeSafe — Scoring your footing/)).toBeInTheDocument();
    expect(screen.getByText(/never sent to either company/i)).toBeInTheDocument();
  });

  it("GATE-3: links to both pages in full, in a new tab so the place is not lost", () => {
    renderGate();
    for (const [name, href] of [
      [/read the terms/i, "/terms"],
      [/read the privacy page/i, "/privacy"],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("GATE-4: records the acceptance only once the box is ticked, then asks for the layout again", async () => {
    const accept = vi.fn(async (): Promise<ActionResult<null>> => ({ ok: true, data: null }));
    const { user } = renderGate(accept);

    await user.click(agreeBox());
    expect(continueButton()).toBeEnabled();
    expect(accept).not.toHaveBeenCalled();

    await user.click(continueButton());
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("GATE-5: a refused write says so and leaves the person able to try again", async () => {
    const accept = vi.fn(
      async (): Promise<ActionResult<null>> => ({ ok: false, error: "failed", message: "Nope." }),
    );
    const { user } = renderGate(accept);

    await user.click(agreeBox());
    await user.click(continueButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
    expect(continueButton()).toBeEnabled();
  });

  it("GATE-6: declining offers only to sign out", async () => {
    const { user, signOut } = renderGate();
    await user.click(screen.getByRole("button", { name: /sign out instead/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("GATE-7: has no axe violations", async () => {
    const { container } = renderGate();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
