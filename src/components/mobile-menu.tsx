"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { PRIMARY_NAV } from "@/components/app-nav";
import { PlanBlaze, PlanMark } from "@/components/plan-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { canStartAttempt } from "@/lib/interview";
import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

type MobileMenuProps = {
  name: string;
  email: string;
  plan: Plan;
  /** The sign-out Server Action. Sign-out is a mutation, so it is a submit control, not a link. */
  signOut: () => Promise<void>;
};

/** The board is "Your trail" here, as in the account menu: the page's own title. */
const LABEL: Record<string, string> = { "/board": "Your trail" };

const itemClass =
  "flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-base font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Everything behind one hamburger, below `md` (practice feedback ticket 01). A first-time user on a
 * phone never found the pages behind the avatar, so on a phone the header offers the control people
 * look for, and it opens a panel with room for a thumb: every page, then the account.
 */
export function MobileMenu({ name, email, plan, signOut }: MobileMenuProps) {
  const pathname = usePathname() ?? "";
  const markPro = !canStartAttempt(plan);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Menu">
          <MenuIcon aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle>Menu</SheetTitle>
        <div className="pr-10">
          <span className="block font-medium">{name}</span>
          <span className="block text-xs break-all text-muted-foreground">{email}</span>
          <PlanMark plan={plan} className="mt-1.5" />
        </div>
        <nav aria-label="Pages" className="-mx-1 border-t border-border pt-3">
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(itemClass, active && "bg-muted")}
                    >
                      {LABEL[item.href] ?? item.label}
                      {"pro" in item && item.pro && markPro && (
                        <span className="flex items-center gap-1 text-xs font-medium text-primary">
                          <PlanBlaze plan="pro" />
                          Pro
                        </span>
                      )}
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="-mx-1 space-y-1 border-t border-border pt-3">
          <SheetClose asChild>
            <Link
              href="/account"
              aria-current={pathname === "/account" ? "page" : undefined}
              className={cn(itemClass, pathname === "/account" && "bg-muted")}
            >
              Account
            </Link>
          </SheetClose>
          <form action={signOut}>
            <button type="submit" className={cn(itemClass, "w-full text-left")}>
              Sign out
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
