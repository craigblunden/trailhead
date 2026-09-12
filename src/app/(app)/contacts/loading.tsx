import { ContactLoading } from "@/components/page-loading";
import { PageOutline } from "@/components/page-transition";

/** Moving between Contacts: the list and header stay in the layout, and only the detail side waits. */
export default function Loading() {
  return (
    <PageOutline>
      <ContactLoading />
    </PageOutline>
  );
}
