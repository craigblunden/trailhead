import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  it("LAND-4: the third feature says a letter is written for each application from its posting and resume, and rewritten from feedback — never 'soon'", () => {
    render(<LandingPage />);
    const feature = screen.getByRole("article", { name: "A cover letter for this application" });

    expect(feature).not.toHaveTextContent(/soon|on the way/i);
    expect(feature).toHaveTextContent(/posting/);
    expect(feature).toHaveTextContent(/resume/);
    expect(feature).toHaveTextContent(/feedback|rewrites/);
    // The miniature stays decorative: its buttons and box are not controls, and it is hidden from AT.
    expect(within(feature).queryByRole("button")).toBeNull();
    expect(within(feature).queryByRole("textbox")).toBeNull();
    expect(feature.querySelector("[aria-hidden='true']")).toHaveTextContent("Rewrite");
  });

  it("LAND-5: after Account deletion, announces it once and drops the flag from the URL", async () => {
    window.history.replaceState(null, "", "/?deleted=1");
    const user = userEvent.setup();
    render(<LandingPage />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Your account and everything in it has been deleted.");
    expect(window.location.pathname + window.location.search).toBe("/");

    await user.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("LAND-5: says nothing without the flag", () => {
    window.history.replaceState(null, "", "/");
    render(<LandingPage />);

    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("LAND-1: hides the decorative scene from assistive technology", () => {
    const { container } = render(<LandingPage />);

    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });
});
