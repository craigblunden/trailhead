import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthForm } from "@/components/auth/auth-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

/** An action that never answers, so the form stays in the pending state under test. */
const never = (): Promise<never> => new Promise(() => {});

/**
 * The live regions that are already on the page. Ticket 20: pending states are announced, and an
 * announcement only reliably reaches a screen reader when it fills a region that was already there.
 */
function liveRegionsBefore() {
  return screen.getAllByRole("status");
}

async function expectAnnounced(regions: HTMLElement[], text: string) {
  await waitFor(() => expect(regions.map((region) => region.textContent)).toContain(text));
}

describe("pending states are announced (ticket 20)", () => {
  it("AUTH-10: creating an account announces that it is under way", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" action={never} resendAction={never} />);
    const regions = liveRegionsBefore();

    await user.type(screen.getByLabelText("Full name"), "Sam Rivera");
    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead-pass-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await expectAnnounced(regions, "Creating your account…");
  });

  it("AUTH-10: signing in announces that it is under way", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" action={never} resendAction={never} />);
    const regions = liveRegionsBefore();

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.type(screen.getByLabelText("Password"), "trailhead-pass-1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await expectAnnounced(regions, "Signing you in…");
  });

  it("PWD-6: requesting a reset link announces that it is being sent", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm action={never} />);
    const regions = liveRegionsBefore();

    await user.type(screen.getByLabelText("Email"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await expectAnnounced(regions, "Sending your reset link…");
  });

  it("PWD-6: choosing a new password announces that it is being saved", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm action={never} />);
    const regions = liveRegionsBefore();

    await user.type(screen.getByLabelText("New password"), "trailhead-pass-2");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await expectAnnounced(regions, "Updating your password…");
  });
});
