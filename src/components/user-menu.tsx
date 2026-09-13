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
import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

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

const PLAN_LABEL: Record<Plan, string> = { free: "Free plan", basic: "Basic plan", pro: "Pro plan" };

/**
 * The Plan, marked with a trail blaze: hollow on free, outlined in the trail colour on basic, painted
 * on pro. The words carry the Plan; the blaze only echoes them.
 */
function PlanMark({ plan }: { plan: Plan }) {
  const paid = plan !== "free";
  return (
    <span
      className={cn(
        "mt-1.5 flex items-center gap-1.5 text-xs",
        paid ? "font-medium text-primary" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-1 rounded-[1px]",
          plan === "pro" && "bg-primary",
          plan === "basic" && "border border-primary",
          plan === "free" && "border border-muted-foreground/70",
        )}
      />
      {PLAN_LABEL[plan]}
    </span>
  );
}

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
          <PlanMark plan={plan} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/board">Your trail</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/contacts">Contacts</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/documents">Documents</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
