import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { BoardView } from "@/components/board/board-view";
import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";
import { listJobs } from "@/server/data/jobs";
import { prefetchJobs } from "@/server/prefetch";

export const metadata: Metadata = { title: "Your trail" };

export default async function BoardPage() {
  // The page, not the layout, decides who may see it.
  await requirePageSession();
  return (
    // Fades in over the loading outline when it arrives (see `../loading.tsx`).
    <PageArrive>
      <HydrationBoundary state={await prefetchJobs(listJobs)}>
        <BoardView />
      </HydrationBoundary>
    </PageArrive>
  );
}
