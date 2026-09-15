import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { AccountView } from "@/components/account/account-view";
import { PageArrive } from "@/components/page-transition";
import { accountCache, lettersCache } from "@/lib/account-client";
import { limitsCache } from "@/lib/documents-client";
import { requirePageSession } from "@/server/auth/session";
import { accountSummary } from "@/server/data/account";
import { generationQuota } from "@/server/data/generation";
import { limits } from "@/server/data/plans";
import { prefetch } from "@/server/prefetch";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  await requirePageSession();
  const state = await prefetch((queryClient) =>
    Promise.all([
      queryClient.prefetchQuery(accountCache.options(accountSummary)),
      queryClient.prefetchQuery(limitsCache.options(limits)),
      queryClient.prefetchQuery(lettersCache.options(() => generationQuota())),
    ]),
  );
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <AccountView />
      </HydrationBoundary>
    </PageArrive>
  );
}
