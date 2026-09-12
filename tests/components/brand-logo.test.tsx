import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandLogo } from "@/components/brand-logo";

describe("BrandLogo", () => {
  it("reads as the product name, Trail to Offer", () => {
    render(<BrandLogo />);
    expect(screen.getByText("Trail to Offer")).toBeInTheDocument();
    expect(screen.queryByText(/Trailhead/)).not.toBeInTheDocument();
  });

  it("links home when given an href", () => {
    render(<BrandLogo href="/board" />);
    expect(screen.getByRole("link", { name: /Trail to Offer/ })).toHaveAttribute("href", "/board");
  });
});
