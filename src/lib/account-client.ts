import { queryOptions } from "@tanstack/react-query";

import type { AccountSummary } from "@/lib/account";
import type { QuotaStatus } from "@/lib/generation";

/**
 * The account page's reads, under keys the server prefetches and the browser hydrates. The Limits
 * are the Documents page's own read (`limitsCache`).
 */
export const accountCache = {
  key: ["account"] as const,
  options: (fetchSummary: () => Promise<AccountSummary>) =>
    queryOptions({ queryKey: accountCache.key, queryFn: () => fetchSummary(), staleTime: 60_000 }),
};

/** Letters left this quota week, as the cover-letter card counts them. */
export const lettersCache = {
  key: ["account", "letters"] as const,
  options: (fetchLetters: () => Promise<QuotaStatus>) =>
    queryOptions({ queryKey: lettersCache.key, queryFn: () => fetchLetters(), staleTime: 60_000 }),
};
