import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The job page's way back to the board, above the title, where a contact's page has its way back to
 * the list. In its own module so the loading state can draw it, live, without the rest of the page.
 */
export function JobBackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
      <Link href="/board">
        <ArrowLeft aria-hidden="true" />
        Back to board
      </Link>
    </Button>
  );
}
