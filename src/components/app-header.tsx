"use client";

import { AppNav } from "@/components/app-nav";
import { useSessionUser } from "@/components/session-provider";
import { UserMenu } from "@/components/user-menu";
import { signOutAction } from "@/server/auth/actions";

type AppHeaderProps = {
  /** Replaces the default logo lockup — used by the job detail back-link. */
  leading: React.ReactNode;
  actions?: React.ReactNode;
};

export function AppHeader({ leading, actions }: AppHeaderProps) {
  const user = useSessionUser();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[110rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <AppNav />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {actions}
          {user && <UserMenu name={user.name} email={user.email} signOut={signOutAction} />}
        </div>
      </div>
    </header>
  );
}
