"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlanBlaze } from "@/components/plan-mark";
import { useSessionUser } from "@/components/session-provider";
import { canStartAttempt } from "@/lib/interview";
import { cn } from "@/lib/utils";

export const PRIMARY_NAV = [
  { href: "/board", label: "Board" },
  { href: "/contacts", label: "Contacts" },
  { href: "/documents", label: "Documents" },
  // Shown to every Plan (interview simulator ticket 08): a Tenant not on `pro` sees it marked as a
  // Pro feature and reaches the real start screen, locked, rather than finding nothing there.
  { href: "/interview", label: "Interview Simulator", pro: true },
] as const;

/**
 * The signed-in application's routes, at md width and up (ticket 13). On a phone the user menu
 * carries the same links, so nothing here is the only way to reach a page.
 */
export function AppNav() {
  const pathname = usePathname() ?? "";
  const user = useSessionUser();
  // Marked for the Plans that cannot use it yet. Unknown until the session is read, and an unmarked
  // item is the quieter guess to be wrong about.
  const markPro = user !== null && !canStartAttempt(user.plan);

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {PRIMARY_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const pro = "pro" in item && item.pro && markPro;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-muted text-foreground",
            )}
          >
            {item.label}
            {pro && (
              <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-primary">
                <PlanBlaze plan="pro" />
                Pro
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
