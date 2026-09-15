import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const PLAN_LABEL: Record<Plan, string> = { free: "Free plan", basic: "Basic plan", pro: "Pro plan" };

/** The trail blaze alone: hollow on free, outlined in the trail colour on basic, painted on pro. */
export function PlanBlaze({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-2.5 w-1 shrink-0 rounded-[1px]",
        plan === "pro" && "bg-primary",
        plan === "basic" && "border border-primary",
        plan === "free" && "border border-muted-foreground/70",
        className,
      )}
    />
  );
}

/**
 * The Plan, marked with its trail blaze — in the user menu and on the account page. The words carry
 * the Plan; the blaze only echoes them.
 */
export function PlanMark({ plan, className }: { plan: Plan; className?: string }) {
  const paid = plan !== "free";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        paid ? "font-medium text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <PlanBlaze plan={plan} />
      {PLAN_LABEL[plan]}
    </span>
  );
}
