import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { DocumentsView } from "@/components/documents/documents-view";
import { PageArrive } from "@/components/page-transition";
import { documentsCache } from "@/lib/documents-client";
import { requirePageSession } from "@/server/auth/session";
import { listDocuments } from "@/server/data/documents";
import { prefetch } from "@/server/prefetch";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requirePageSession();
  const state = await prefetch((queryClient) =>
    queryClient.prefetchQuery(documentsCache.options(listDocuments)),
  );
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <DocumentsView />
      </HydrationBoundary>
    </PageArrive>
  );
}
