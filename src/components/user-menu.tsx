"use client";

import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlanMark } from "@/components/plan-mark";
import type { Plan } from "@/lib/plans";

type UserMenuProps = {
  name: string;
  email: string;
  plan: Plan;
  /** The sign-out Server Action. Sign-out is a mutation, so it is a submit control, not a link. */
  signOut: () => Promise<void>;
};

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * The account, at md and up (practice feedback ticket 01). The primary nav is always on show there, so the
 * menu no longer repeats its pages; below md the header's hamburger (`mobile-menu.tsx`) carries both.
 */
export function UserMenu({ name, email, plan, signOut }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          aria-label={`Account menu for ${name}`}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">
              {toInitials(name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{email}</span>
          <PlanMark plan={plan} className="mt-1.5" />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Account</Link>
        </DropdownMenuItem>
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
