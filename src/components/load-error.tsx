import { Button } from "@/components/ui/button";

/**
 * What a failed load says beneath its own heading, and the one way back. Shared by the board and a
 * Job's page so the words for "something went wrong" and the retry button never drift apart —
 * each page keeps its own heading level and container, since one sits inline in an already-drawn
 * page and the other takes over the whole page.
 */
export function LoadErrorHint({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Something went wrong on our side. Your jobs are safe — try again in a moment.
      </p>
      <Button className="mt-5 h-10 px-4" onClick={onRetry}>
        Try again
      </Button>
    </>
  );
}
