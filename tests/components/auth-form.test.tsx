import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthForm } from "@/components/auth/auth-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  push.mockClear();
});

describe("signup", () => {
  it("AUTH-1: asks for name, email and password, each properly labelled", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("AUTH-2: requires eight characters and says so", () => {
    render(<AuthForm mode="signup" />);
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAccessibleDescription("At least 8 characters.");
  });

  it("AUTH-2: uses the new-password autocomplete hint", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("AUTH-3: sends a completed signup to the board", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);

    await user.type(screen.getByLabelText("Full name"), "Sam Rivera");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(push).toHaveBeenCalledWith("/board");
  });

  it("AUTH-3: does not navigate while a required field is empty", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(push).not.toHaveBeenCalled();
  });

  it("AUTH-4: offers the way over to sign in", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});

describe("login", () => {
  it("AUTH-1: asks only for email and password", () => {
    render(<AuthForm mode="login" />);

    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("AUTH-2: uses the current-password autocomplete hint", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("AUTH-3: sends a completed sign in to the board", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(push).toHaveBeenCalledWith("/board");
  });

  it("AUTH-4: offers the way over to signup", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
