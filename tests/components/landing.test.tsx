import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import LandingPage from "@/app/page";

describe("landing page", () => {
  it("LAND-1: states the proposition in a single h1", () => {
    render(<LandingPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Every application, one trail.");
  });

  it("LAND-2: points the primary call to action at signup", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("link", { name: /Start tracking — it’s free/ }),
    ).toHaveAttribute("href", "/signup");
  });

  it("LAND-2: points the secondary call to action at sign in", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: "I have an account" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("LAND-3: keeps the header lean — Get started always, Sign in only past sm", () => {
    render(<LandingPage />);
    const nav = screen.getByRole("navigation", { name: "Account" });

    expect(within(nav).getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/signup",
    );
    // Hidden below the sm breakpoint so the header cannot overflow at 320px;
    // the hero repeats the same destination.
    const signIn = within(nav).getByRole("link", { name: "Sign in" });
    expect(signIn.closest("a")).toHaveClass("hidden", "sm:inline-flex");
  });

  it("LAND-1: hides the decorative scene from assistive technology", () => {
    const { container } = render(<LandingPage />);

    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });
});
