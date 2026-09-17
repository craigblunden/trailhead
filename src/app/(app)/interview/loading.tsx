import { PageLoading } from "@/components/page-loading";
import { PageOutline } from "@/components/page-transition";

/**
 * Moving between the Interview Simulator's pages — the hub, a Job's page, a past Attempt's Scorecard —
 * inside the job store the interview layout keeps mounted. The signed-in loading state above sits
 * outside that layout, so without this one a navigation that stays inside it never suspends and shows
 * nothing until the page arrives (interview second pass ticket 01).
 */
export default function Loading() {
  return (
    <PageOutline>
      <PageLoading />
    </PageOutline>
  );
}
