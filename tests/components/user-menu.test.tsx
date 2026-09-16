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

  it("offers the account page after the sections and before Sign out", async () => {
    const menu = await openMenu("free");
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Your trail",
      "Contacts",
      "Documents",
      "Interview SimulatorPro",
      "Account",
      "Sign out",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Account" })).toHaveAttribute("href", "/account");
  });

  /**
   * On a phone this menu is the only way to the primary nav's routes, so it carries the Interview
   * Simulator too — marked for the Plans that cannot start an Attempt yet (interview simulator
   * ticket 08), and unmarked on `pro`, where the mark would say nothing.
   */
  it("carries interview practice, marked as Pro only for the Plans that cannot use it", async () => {
    for (const plan of ["free", "basic"] as const) {
      const menu = await openMenu(plan);
      const item = within(menu).getByRole("menuitem", { name: /Interview Simulator/ });
      expect(item).toHaveAttribute("href", "/interview");
      expect(item).toHaveTextContent("Pro");
      cleanup();
    }

    const pro = await openMenu("pro");
    expect(within(pro).getByRole("menuitem", { name: "Interview Simulator" })).toHaveAttribute(
      "href",
      "/interview",
    );
  });
});
