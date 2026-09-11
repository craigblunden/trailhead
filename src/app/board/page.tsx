import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { BoardView } from "@/components/board/board-view";
import { listJobs } from "@/server/data/jobs";
import { prefetchJobs } from "@/server/prefetch";

export const metadata: Metadata = { title: "Your trail" };

export default function BoardPage() {
  return (
    <HydrationBoundary state={prefetchJobs(listJobs)}>
      <BoardView />
    </HydrationBoundary>
  );
}
