import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppFeedback } from "@/components/app-feedback";
import { SessionProvider } from "@/components/session-provider";
import type { ActionResult } from "@/server/action-result";
import type { AppFeedbackInput } from "@/server/validation";

type Send = (input: AppFeedbackInput) => Promise<ActionResult<null>>;

function setup(send: Send = vi.fn(async () => ({ ok: true as const, data: null }))) {
  const user = userEvent.setup();
  render(
    <SessionProvider user={{ name: "Sam Rivera", email: "sam.rivera@example.com", plan: "free" }}>
      <AppFeedback send={send} />
    </SessionProvider>,
  );
  return { user, send };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Feedback" }));
  return screen.findByRole("dialog", { name: /feedback/i });
}

describe("AppFeedback", () => {
  it("opens a modal with a rating and a box for the user's words", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);

    const rating = within(dialog).getByRole("group", { name: /how is trailhead/i });
    expect(within(rating).getAllByRole("radio")).toHaveLength(5);
    expect(within(dialog).getByLabelText(/what.s on your mind/i)).toBeRequired();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("sends the rating and words, then thanks the user by name", async () => {
    const { user, send } = setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("radio", { name: /4 stars/i }));
    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "  Could the board sort by date?  ");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));

    expect(send).toHaveBeenCalledWith({ rating: 4, message: "Could the board sort by date?" });
    expect(await within(dialog).findByRole("heading", { name: /thank you, sam/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/appreciate/i);
    expect(within(dialog).queryByRole("button", { name: "Send feedback" })).toBeNull();
  });

  it("asks for a rating before sending anything", async () => {
    const { user, send } = setup();
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "Hello");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));

    expect(send).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Choose a rating")).toBeInTheDocument();
  });

  it("keeps what was written, and says so, when the send fails", async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: "failed", message: "Something went wrong on our side." }));
    const { user } = setup(send);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("radio", { name: /2 stars/i }));
    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "The upload hung.");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/didn.t send/i);
    expect(within(dialog).getByLabelText(/what.s on your mind/i)).toHaveValue("The upload hung.");
  });

  it("stays open while a send is on its way, so its thanks is never missed", async () => {
    let arrive: (result: ActionResult<null>) => void = () => {};
    const send = vi.fn<Send>(() => new Promise((resolve) => (arrive = resolve)));
    const { user } = setup(send);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("radio", { name: /3 stars/i }));
    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "Search would help.");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBe(dialog);

    arrive({ ok: true, data: null });
    expect(await within(dialog).findByRole("heading", { name: /thank you/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Back to the trail" })).toHaveFocus();
  });

  it("starts fresh when opened again after a thank-you", async () => {
    const { user } = setup();
    let dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /5 stars/i }));
    await user.type(within(dialog).getByLabelText(/what.s on your mind/i), "Great.");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));
    await user.click(await within(dialog).findByRole("button", { name: "Back to the trail" }));

    dialog = await openDialog(user);
    expect(within(dialog).getByLabelText(/what.s on your mind/i)).toHaveValue("");
  });
});
