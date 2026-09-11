import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthForm } from "@/components/auth/auth-form";
import type { AuthState } from "@/server/auth/actions";

/** A stand-in Server Action that records what the form sent and answers with `result`. */
function fakeAction(result: AuthState = { status: "idle" }) {
  const calls: Record<string, FormDataEntryValue>[] = [];
  const action = vi.fn(async (_state: AuthState, formData: FormData) => {
    calls.push(Object.fromEntries(formData.entries()));
    return result;
  });
  return { action, calls };
}

const idle = fakeAction().action;

describe("signup", () => {
  it("AUTH-1: asks for name, email and password, each properly labelled", () => {
    render(<AuthForm mode="signup" action={idle} resendAction={idle} />);

    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("AUTH-2: requires eight characters and says so", () => {
    render(<AuthForm mode="signup" action={idle} resendAction={idle} />);
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAccessibleDescription("At least 8 characters.");
  });

  it("AUTH-2: uses the new-password autocomplete hint", () => {
    render(<AuthForm mode="signup" action={idle} resendAction={idle} />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("AUTH-3: submits name, email and password to the sign-up action", async () => {
    const user = userEvent.setup();
    const { action, calls } = fakeAction({ status: "check-email", email: "sam@example.com" });
    render(<AuthForm mode="signup" action={action} resendAction={idle} />);

    await user.type(screen.getByLabelText("Full name"), "Sam Rivera");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(calls[0]).toMatchObject({
      name: "Sam Rivera",
      email: "sam@example.com",
      password: "trailhead",
    });
  });

  it("AUTH-3: does not submit while a required field is empty", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction();
    render(<AuthForm mode="signup" action={action} resendAction={idle} />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(action).not.toHaveBeenCalled();
  });

  it("AUTH-5: after sign-up, shows the same check-your-email state with a resend control", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({ status: "check-email", email: "sam@example.com" });
    const resend = fakeAction({ status: "resent", email: "sam@example.com" });
    render(<AuthForm mode="signup" action={action} resendAction={resend.action} />);

    await user.type(screen.getByLabelText("Full name"), "Sam Rivera");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/We sent a verification link to/)).toHaveTextContent("sam@example.com");
    expect(screen.queryByLabelText("Password")).toBeNull();

    await user.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(resend.action).toHaveBeenCalledTimes(1));
    expect(resend.calls[0]).toMatchObject({ email: "sam@example.com" });
    expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
  });

  it("AUTH-6: renders field errors inline, associated with their field, and a form-level alert", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({
      status: "error",
      message: "Check the highlighted fields.",
      fields: { password: "Use at least 8 characters" },
    });
    render(<AuthForm mode="signup" action={action} resendAction={idle} />);

    await user.type(screen.getByLabelText("Full name"), "Sam Rivera");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/Use at least 8 characters/);
  });

  it("AUTH-4: offers the way over to sign in", () => {
    render(<AuthForm mode="signup" action={idle} resendAction={idle} />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});

describe("login", () => {
  it("AUTH-1: asks only for email and password", () => {
    render(<AuthForm mode="login" action={idle} resendAction={idle} />);

    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("AUTH-2: uses the current-password autocomplete hint", () => {
    render(<AuthForm mode="login" action={idle} resendAction={idle} />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("AUTH-3: submits email and password to the sign-in action", async () => {
    const user = userEvent.setup();
    const { action, calls } = fakeAction();
    render(<AuthForm mode="login" action={action} resendAction={idle} />);

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(calls[0]).toMatchObject({ email: "sam@example.com", password: "trailhead" });
  });

  it("AUTH-7: an unverified address gets an explanation and a resend control, not a bare error", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({ status: "unverified", email: "sam@example.com" });
    const resend = fakeAction({ status: "resent", email: "sam@example.com" });
    render(<AuthForm mode="login" action={action} resendAction={resend.action} />);

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/hasn.t been verified yet/);
    await user.click(within(alert).getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(resend.action).toHaveBeenCalledTimes(1));
  });

  it("AUTH-8: a wrong password reads as a mismatch, never as 'no such account'", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({
      status: "error",
      message: "That email and password don't match.",
    });
    render(<AuthForm mode="login" action={action} resendAction={idle} />);

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
  });

  it("AUTH-9: opens with a notice when told to, e.g. after a bad verification link", () => {
    render(
      <AuthForm mode="login" action={idle} resendAction={idle} notice="That link has expired." />,
    );

    const notice = screen.getByText("That link has expired.");
    expect(notice).toHaveAttribute("role", "status");
  });

  it("AUTH-4: offers the way over to signup and to password reset", () => {
    render(<AuthForm mode="login" action={idle} resendAction={idle} />);

    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
