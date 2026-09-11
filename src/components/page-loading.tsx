import { AppHeader } from "@/components/app-header";
import { TrailheadLogo } from "@/components/trailhead-logo";

/**
 * What a signed-in page shows the moment someone navigates to it, while the server checks the
 * session and reads the page's data (performance ticket 02). The header has the page's own layout,
 * so nothing moves when the content arrives, and the wait is announced, not only shown.
 */
export function PageLoading() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<TrailheadLogo href="/board" />} loading />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <LoadingStatus />
      </main>
    </div>
  );
}

/** The announced wait on its own, for a loading state inside a layout that already has a header. */
export function LoadingStatus() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Loading…
    </p>
  );
}
