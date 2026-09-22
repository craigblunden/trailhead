"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountClient } from "@/components/account/account-actions-client";
import { describeFailure } from "@/components/action-client";
import { Button } from "@/components/ui/button";
import type { AccountSummary } from "@/lib/account";
import { accountCache } from "@/lib/account-client";
import { UPGRADE_REQUESTED_LABEL, askToUpgradeLabel, nextPlanUp } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * The control for an **Upgrade request** (CONTEXT.md; ADR-0009): one button that tells the owner a
 * Tenant would like the next Plan up.
 *
 * It is not a checkout. Nothing is bought, nothing changes about the Tenant when it is pressed, and
 * the Plan moves only when the owner moves it by hand (ADR-0001). So: one press, no dialog to confirm
 * a message, and no free-text box — words already have a home in App feedback, and free text here
 * would need the Flag machinery that letters have.
 *
 * Rendered twice on the account page, in `Your plan` and again in the plans grid, where the Practice
 * round's upsell lands. It holds no state of its own; both read the same summary.
 */
export function RequestUpgrade({ summary, className }: { summary: AccountSummary; className?: string }) {
  const queryClient = useQueryClient();
  const wanted = nextPlanUp(summary.plan);

  const ask = useMutation({
    mutationFn: () => accountClient.requestUpgrade(),
    onSuccess: (request) => {
      // The server stored it; the cache is told the same rather than refetching a page of counts.
      queryClient.setQueryData<AccountSummary>(accountCache.key, (current) =>
        current ? { ...current, upgradeRequest: request } : current,
      );
    },
    onError: () => {
      // A refusal is nearly always "you already asked", and the honest answer is the real state.
      void queryClient.invalidateQueries({ queryKey: accountCache.key });
    },
  });

  // Nothing to ask for on the top Plan.
  if (!wanted) return null;

  const requested = summary.upgradeRequest !== null;
  const failure = ask.isError ? describeFailure(ask.error, FALLBACK) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        variant={requested ? "outline" : "default"}
        size="sm"
        disabled={requested || ask.isPending}
        onClick={() => ask.mutate()}
      >
        {requested ? UPGRADE_REQUESTED_LABEL : ask.isPending ? "Asking…" : askToUpgradeLabel(wanted)}
      </Button>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}

const FALLBACK = "We couldn’t send your request. Check your connection and try again.";
