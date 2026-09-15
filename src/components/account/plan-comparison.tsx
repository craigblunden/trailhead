import { useId } from "react";

import { PLAN_LABEL, PlanBlaze } from "@/components/plan-mark";
import { PLANS, PLAN_LIMITS, type Limit, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

const limitText = (limit: Limit) => (limit === "unlimited" ? "Unlimited" : String(limit));

/**
 * Every Plan side by side with its Limits, the current one marked. Static, like the Supporting
 * documents preview on a Job: there is no way to pay for a Plan yet, so nothing here is a control,
 * a link, or a price. Every number is read from `PLAN_LIMITS`, never written here — a test holds
 * that.
 */
export function PlanComparison({ current }: { current: Plan }) {
  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">Paying for a plan is coming soon.</p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanColumn key={plan} plan={plan} current={plan === current} />
        ))}
      </ul>
    </>
  );
}

function PlanColumn({ plan, current }: { plan: Plan; current: boolean }) {
  const nameId = useId();
  const { documents, lettersPerWeek } = PLAN_LIMITS[plan];

  return (
    <li
      aria-labelledby={nameId}
      className={cn(
        "rounded-md bg-background/60 p-4 ring-1 ring-foreground/10",
        current && "bg-accent/60 ring-primary/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p id={nameId} className="flex items-center gap-2 font-medium">
          <PlanBlaze plan={plan} />
          {PLAN_LABEL[plan]}
        </p>
        {current && <span className="text-xs font-medium text-primary">Your plan</span>}
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Documents on file</dt>
          <dd className="font-medium tabular-nums">{limitText(documents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Cover letters a week</dt>
          <dd className="font-medium tabular-nums">{limitText(lettersPerWeek)}</dd>
        </div>
      </dl>
    </li>
  );
}
