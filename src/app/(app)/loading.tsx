import { PageLoading } from "@/components/page-loading";

/**
 * Moving between the signed-in sections — Board, Contacts, Documents — shows this at once. It also
 * covers the contacts layout, which reads the session and prefetches the list, since a loading state
 * never covers the layout in its own folder.
 *
 * The pages still await their prefetch before they hydrate (see `src/server/prefetch.ts`); this only
 * tells the user their click landed.
 */
export default function Loading() {
  return <PageLoading />;
}
