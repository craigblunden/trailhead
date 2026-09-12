import { PageLoading } from "@/components/page-loading";
import { PageOutline } from "@/components/page-transition";

/** Moving between the board and a Job's page, inside the job store the board layout keeps mounted. */
export default function Loading() {
  return (
    <PageOutline>
      <PageLoading />
    </PageOutline>
  );
}
