import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { DocumentsView } from "@/components/documents/documents-view";
import { PageArrive } from "@/components/page-transition";
import { documentsCache, limitsCache } from "@/lib/documents-client";
import { requirePageSession } from "@/server/auth/session";
import { listDocuments } from "@/server/data/documents";
import { limits } from "@/server/data/plans";
import { ignore, prefetch } from "@/server/prefetch";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requirePageSession();
  const state = await prefetch((queryClient) =>
    Promise.all([
      queryClient.query(documentsCache.options(listDocuments)).catch(ignore),
      queryClient.query(limitsCache.options(limits)).catch(ignore),
    ]),
  );
  return (
    <PageArrive>
      <HydrationBoundary state={state}>
        <DocumentsView />
      </HydrationBoundary>
    </PageArrive>
  );
}
