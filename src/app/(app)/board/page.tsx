import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { BoardView } from "@/components/board/board-view";
import { requirePageSession } from "@/server/auth/session";
import { listJobs } from "@/server/data/jobs";
import { prefetchJobs } from "@/server/prefetch";

export const metadata: Metadata = { title: "Your trail" };

export default async function BoardPage() {
  // The page, not the layout, decides who may see it.
  await requirePageSession();
  return (
    <HydrationBoundary state={await prefetchJobs(listJobs)}>
      <BoardView />
    </HydrationBoundary>
  );
}
