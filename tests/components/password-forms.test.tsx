import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { AuthState } from "@/server/auth/actions";

function fakeAction(result: AuthState = { status: "idle" }) {
  const calls: Record<string, FormDataEntryValue>[] = [];
  const action = vi.fn(async (_state: AuthState, formData: FormData) => {
    calls.push(Object.fromEntries(formData.entries()));
    return result;
  });
  return { action, calls };
}

describe("forgot password (ticket 06)", () => {
  it("PWD-1: asks for an email and submits it to the request action", async () => {
    const user = userEvent.setup();
    const { action, calls } = fakeAction({ status: "sent", email: "sam@example.com" });
    render(<ForgotPasswordForm action={action} />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(calls[0]).toMatchObject({ email: "sam@example.com" });
  });

  it("PWD-2: renders the same confirmation whatever the address, keyed only on what was typed", async () => {
    const user = userEvent.setup();
    const markup: string[] = [];

    for (const email of ["registered@example.com", "nobody@example.com"]) {
      const { action } = fakeAction({ status: "sent", email });
      const { container, unmount } = render(<ForgotPasswordForm action={action} />);
      await user.type(screen.getByLabelText("Email"), email);
      await user.click(screen.getByRole("button", { name: "Send reset link" }));
      await screen.findByRole("heading", { name: "Check your email" });
      markup.push(container.innerHTML.replaceAll(email, "<email>"));
      unmount();
    }

    expect(markup[0]).toBe(markup[1]);
  });

  it("PWD-3: opens with a recoverable notice after a bad link, and the form still works", () => {
    render(
      <ForgotPasswordForm
        action={fakeAction().action}
        notice="That reset link has expired or was already used. Request a fresh one below."
      />,
    );

    expect(screen.getByText(/expired or was already used/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});

describe("reset password (ticket 06)", () => {
  it("PWD-4: asks for a new password with the same minimum as sign-up, and submits it", async () => {
    const user = userEvent.setup();
    const { action, calls } = fakeAction();
    render(<ResetPasswordForm action={action} />);

    const password = screen.getByLabelText("New password");
    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAccessibleDescription("At least 8 characters.");

    await user.type(password, "a-new-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(calls[0]).toMatchObject({ password: "a-new-password" });
  });

  it("PWD-5: renders a server-side rejection inline, associated with the field", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({
      status: "error",
      message: "Check the highlighted fields.",
      fields: { password: "Use at least 8 characters" },
    });
    render(<ResetPasswordForm action={action} />);

    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      /Use at least 8 characters/,
    );
  });
});
