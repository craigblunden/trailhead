import type { Metadata } from "next";

import { PageArrive } from "@/components/page-transition";
import { requirePageSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  await requirePageSession();
  // Wide screens show this beside the list; narrow ones show only the list (see ContactsShell).
  return (
    <PageArrive>
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Choose a contact to see their details and every role they’re part of.
        </p>
      </div>
    </PageArrive>
  );
}
