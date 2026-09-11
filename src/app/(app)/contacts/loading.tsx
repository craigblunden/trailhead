import { LoadingStatus } from "@/components/page-loading";

/** Moving between Contacts: the list and header stay in the layout, and only the detail side waits. */
export default function Loading() {
  return <LoadingStatus />;
}
