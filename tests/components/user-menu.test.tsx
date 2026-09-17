import { describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserMenu } from "@/components/user-menu";
import type { Plan } from "@/lib/plans";

async function openMenu(plan: Plan) {
  const user = userEvent.setup();
  render(
    <UserMenu name="Sam Rivera" email="sam.rivera@example.com" plan={plan} signOut={async () => {}} />,
  );
  await user.click(screen.getByRole("button", { name: /Account menu for Sam Rivera/ }));
  return screen.findByRole("menu");
}

describe("UserMenu", () => {
  it("names the free Plan under the email", async () => {
    const menu = await openMenu("free");
    expect(menu).toHaveTextContent(/sam\.rivera@example\.com\s*Free plan/);
  });

  it("names the basic Plan under the email", async () => {
    const menu = await openMenu("basic");
    expect(menu).toHaveTextContent(/sam\.rivera@example\.com\s*Basic plan/);
  });

  it("names the pro Plan under the email", async () => {
    const menu = await openMenu("pro");
    expect(menu).toHaveTextContent(/sam\.rivera@example\.com\s*Pro plan/);
  });

  /**
   * At md and up the primary nav is always on show, so the menu is the account alone (practice feedback
   * ticket 01); below md the hamburger carries the pages instead.
   */
  it("holds the account and Sign out, not the pages the primary nav already shows", async () => {
    const menu = await openMenu("free");
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Account", "Sign out"]);
    expect(within(menu).getByRole("menuitem", { name: "Account" })).toHaveAttribute("href", "/account");
  });
});
