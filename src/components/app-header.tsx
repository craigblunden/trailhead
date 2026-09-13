"use client";

import { AppFeedback, AppFeedbackPlaceholder } from "@/components/app-feedback";
import { AppNav } from "@/components/app-nav";
import { PageWaitSlot } from "@/components/page-wait";
import { useSessionUser } from "@/components/session-provider";
import { UserMenu } from "@/components/user-menu";
import { sendAppFeedbackAction } from "@/server/actions/app-feedback";
import { signOutAction } from "@/server/auth/actions";

type AppHeaderProps = {
  /** What stands at the start of the header: the logo lockup, on every page. */
  leading: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * While the page is still loading, the Feedback button and account menu are drawn as placeholders. A
   * live one would be replaced by the page's own header when it arrives, closing itself under an open
   * click.
   */
  loading?: boolean;
};

export function AppHeader({ leading, actions, loading = false }: AppHeaderProps) {
  const user = useSessionUser();

  return (
    // Named for the view transition between pages, where it is pinned: the one thing that never moves.
    <header
      style={{ viewTransitionName: "app-header" }}
      className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur"
    >
      {/* One height on every page, with or without a button in it: the account menu is shorter than a
          button, so without the floor a page with actions has a taller header. */}
      <div className="mx-auto flex min-h-15 w-full max-w-[110rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <AppNav />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {actions}
          {/* A loading page’s wait is drawn here, beside the account menu, on every page. */}
          <PageWaitSlot />
          {user &&
            (loading ? (
              <>
                <AppFeedbackPlaceholder />
                <span aria-hidden="true" className="size-8 rounded-full bg-muted" />
              </>
            ) : (
              <>
                <AppFeedback send={sendAppFeedbackAction} />
                <UserMenu
                  name={user.name}
                  email={user.email}
                  plan={user.plan}
                  signOut={signOutAction}
                />
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
