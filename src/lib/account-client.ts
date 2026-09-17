import { queryOptions } from "@tanstack/react-query";

import type { AccountSummary } from "@/lib/account";
import type { QuotaStatus } from "@/lib/generation";
import type { InterviewQuotaStatus } from "@/lib/interview";

/**
 * The account page's reads, under keys the server prefetches and the browser hydrates. The Limits
 * are the Documents page's own read (`limitsCache`).
 */
export const accountCache = {
  key: ["account"] as const,
  staleTime: 60_000,
  options: (fetchSummary: () => Promise<AccountSummary>) =>
    queryOptions({ queryKey: accountCache.key, queryFn: () => fetchSummary(), staleTime: accountCache.staleTime }),
};

/** Letters left this quota week, as the cover-letter card counts them. */
export const lettersCache = {
  key: ["account", "letters"] as const,
  staleTime: 60_000,
  options: (fetchLetters: () => Promise<QuotaStatus>) =>
    queryOptions({ queryKey: lettersCache.key, queryFn: () => fetchLetters(), staleTime: lettersCache.staleTime }),
};

/** Interview Simulator Attempts left this quota week, as its start screen counts them. */
export const interviewsCache = {
  key: ["account", "interviews"] as const,
  staleTime: 60_000,
  options: (fetchInterviews: () => Promise<InterviewQuotaStatus>) =>
    queryOptions({
      queryKey: interviewsCache.key,
      queryFn: () => fetchInterviews(),
      staleTime: interviewsCache.staleTime,
    }),
};
