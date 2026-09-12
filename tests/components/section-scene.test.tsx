import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionScene, sceneSectionFor } from "@/components/section-scene";
import { TrailScene } from "@/components/trail-scene";

/**
 * The landscape beneath the signed-in sections stays mounted in the `(app)` layout; the URL only
 * decides which section's foreground it shows.
 */

let pathname = "/board";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("which foreground the scene shows", () => {
  it.each([
    ["/board", "board"],
    ["/contacts", "contacts"],
    ["/contacts/c1", "contacts"],
    ["/documents", "documents"],
    ["/board/job-1", null],
    ["/contactsheet", null],
  ])("on %s it is %s", (path, section) => {
    expect(sceneSectionFor(path)).toBe(section);
  });
});

describe("the scene across navigations", () => {
  it("keeps the same drawing mounted while the section changes, and steps aside on a Job's page", () => {
    let renders = 0;
    function Scene() {
      renders += 1;
      return <div data-testid="scene" />;
    }
    const scene = <Scene />;

    pathname = "/board";
    const { rerender } = render(<SectionScene>{scene}</SectionScene>);
    const drawing = screen.getByTestId("scene");
    expect(drawing.parentElement).toHaveAttribute("data-scene", "board");

    pathname = "/contacts";
    rerender(<SectionScene>{scene}</SectionScene>);
    expect(screen.getByTestId("scene")).toBe(drawing);
    expect(drawing.parentElement).toHaveAttribute("data-scene", "contacts");

    pathname = "/board/job-1";
    rerender(<SectionScene>{scene}</SectionScene>);
    expect(drawing.parentElement).not.toBeVisible();

    expect(renders).toBe(1);
  });

  it("draws a foreground for every section, hidden from assistive technology", () => {
    const { container } = render(<TrailScene variant="trail" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    for (const section of ["board", "contacts", "documents"]) {
      expect(container.querySelector(`[data-scene-part="${section}"]`)).not.toBeNull();
    }
  });
});
