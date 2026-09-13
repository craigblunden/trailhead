import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
