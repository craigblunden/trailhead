import { PageLoading } from "@/components/page-loading";
import { PageOutline } from "@/components/page-transition";

/**
 * Moving between the signed-in sections — Board, Contacts, Documents — shows this at once. It also
 * covers the contacts layout, which reads the session and prefetches the list, since a loading state
 * never covers the layout in its own folder.
 *
 * The pages still await their prefetch before they hydrate (see `src/server/prefetch.ts`); this only
 * tells the user their click landed. When the page arrives, this outline fades out under it.
 */
export default function Loading() {
  return (
    <PageOutline>
      <PageLoading />
    </PageOutline>
  );
}
