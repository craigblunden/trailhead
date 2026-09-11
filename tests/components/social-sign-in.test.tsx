import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";

import { SocialSignIn } from "@/components/auth/social-sign-in";
import { SOCIAL_PROVIDERS } from "@/lib/social-providers";

const BOTH = [...SOCIAL_PROVIDERS];

describe("social sign-in buttons (ticket 07)", () => {
  it("SOC-2: renders nothing at all when no provider is configured", () => {
    const { container } = render(<SocialSignIn providers={[]} startSignIn={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("SOC-2: renders only the providers it is given", () => {
    render(<SocialSignIn providers={[SOCIAL_PROVIDERS[1]]} startSignIn={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  it("SOC-3: each button's accessible name names its provider, not an icon", () => {
    render(<SocialSignIn providers={BOTH} startSignIn={vi.fn()} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent?.trim())).toEqual([
      "Continue with Google",
      "Continue with GitHub",
    ]);
    // The icons are decoration; they add nothing to the name.
    for (const icon of document.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("SOC-4: starts the OAuth redirect for the provider pressed", async () => {
    const user = userEvent.setup();
    const startSignIn = vi.fn(() => new Promise<never>(() => {}));
    render(<SocialSignIn providers={BOTH} startSignIn={startSignIn} />);

    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));

    expect(startSignIn).toHaveBeenCalledExactlyOnceWith("github");
  });

  it("SOC-4: while the browser leaves for the provider, the wait is announced and neither button fires again", async () => {
    const user = userEvent.setup();
    const startSignIn = vi.fn(() => new Promise<never>(() => {}));
    render(<SocialSignIn providers={BOTH} startSignIn={startSignIn} />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Taking you to Google…");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(startSignIn).toHaveBeenCalledTimes(1);
  });

  it("SOC-5: a failure to start says so and hands the buttons back", async () => {
    const user = userEvent.setup();
    const startSignIn = vi.fn(async () => {
      throw new Error("network down");
    });
    render(<SocialSignIn providers={BOTH} startSignIn={startSignIn} />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't reach Google. Try again, or use your email.");
    expect(alert).not.toHaveTextContent("network down");
    await waitFor(() => {
      for (const button of screen.getAllByRole("button")) expect(button).toBeEnabled();
    });
  });

  it("A11Y-1: no structural violations", async () => {
    const { container } = render(<SocialSignIn providers={BOTH} startSignIn={vi.fn()} />);
    expect(
      await axe(container, { rules: { "color-contrast": { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
