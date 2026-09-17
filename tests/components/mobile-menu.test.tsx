import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MobileMenu } from "@/components/mobile-menu";
import type { Plan } from "@/lib/plans";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts" }));

async function openMenu(plan: Plan, signOut: () => Promise<void> = async () => {}) {
  const user = userEvent.setup();
  render(<MobileMenu name="Sam Rivera" email="sam.rivera@example.com" plan={plan} signOut={signOut} />);
  await user.click(screen.getByRole("button", { name: "Menu" }));
  return { user, sheet: await screen.findByRole("dialog", { name: "Menu" }) };
}

/**
 * On a phone the header has no room for the primary nav, so everything lives behind one hamburger
 * (practice feedback ticket 01): every page, and the account.
 */
describe("MobileMenu", () => {
  it("carries every page, then the account, then Sign out", async () => {
    const { sheet } = await openMenu("pro");
    const links = within(sheet)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["Your trail", "/board"],
      ["Contacts", "/contacts"],
      ["Documents", "/documents"],
      ["Interview Simulator", "/interview"],
      ["Account", "/account"],
    ]);
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("says who is signed in and on which Plan", async () => {
    const { sheet } = await openMenu("basic");
    expect(sheet).toHaveTextContent(/Sam Rivera\s*sam\.rivera@example\.com\s*Basic plan/);
  });

  it("marks the page the Tenant is on", async () => {
    const { sheet } = await openMenu("free");
    expect(within(sheet).getByRole("link", { name: "Contacts" })).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("link", { name: "Documents" })).not.toHaveAttribute("aria-current");
  });

  it("marks the Interview Simulator as Pro only for the Plans that cannot start an Attempt", async () => {
    for (const plan of ["free", "basic"] as const) {
      const { sheet } = await openMenu(plan);
      expect(within(sheet).getByRole("link", { name: /Interview Simulator/ })).toHaveTextContent("Pro");
      cleanup();
    }
    const { sheet } = await openMenu("pro");
    expect(within(sheet).getByRole("link", { name: /Interview Simulator/ })).not.toHaveTextContent("Pro");
  });

  it("signs out through the Server Action", async () => {
    const signOut = vi.fn(async () => {});
    const { user, sheet } = await openMenu("free", signOut);
    await user.click(within(sheet).getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("closes when a page is chosen", async () => {
    const { user, sheet } = await openMenu("free");
    await user.click(within(sheet).getByRole("link", { name: "Documents" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
