"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const PRIMARY_NAV = [
  { href: "/board", label: "Board" },
  { href: "/contacts", label: "Contacts" },
  { href: "/documents", label: "Documents" },
] as const;

/**
 * The signed-in application's routes, at md width and up (ticket 13). On a phone the user menu
 * carries the same links, so nothing here is the only way to reach a page.
 */
export function AppNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {PRIMARY_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-muted text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
