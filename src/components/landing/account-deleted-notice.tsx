"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ACCOUNT_DELETED_NOTICE } from "@/lib/account";

/**
 * The one line Account deletion lands on. The landing page stays static, so the flag is read from
 * the address after hydration rather than from the request, then dropped, so a reload does not
 * repeat it. The status region is on the page from the start and filled afterwards: a live region
 * that arrives already holding its text is often not announced.
 */
export function AccountDeletedNotice() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("deleted") !== "1") return;
    url.searchParams.delete("deleted");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable after hydration
    setShown(true);
  }, []);

  return (
    <div role="status" className="mx-auto w-full max-w-3xl px-6">
      {shown && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm">
          <p>{ACCOUNT_DELETED_NOTICE}</p>
          <Button variant="outline" size="sm" onClick={() => setShown(false)}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
