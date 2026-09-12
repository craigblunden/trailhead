"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";

/**
 * The job page's header: the way back to the board in place of the logo. In its own module so the
 * loading state can draw it without carrying the rest of the job page along.
 */
export function JobDetailHeader({ loading = false }: { loading?: boolean }) {
  return (
    <AppHeader
      loading={loading}
      leading={
        <>
          <Button asChild variant="outline" className="h-9 px-3">
            <Link href="/board">
              <ArrowLeft aria-hidden="true" />
              Board
            </Link>
          </Button>
          {/* Off on a phone, where the way back and a loading page’s wait need the width. */}
          <span className="hidden font-heading text-xl font-semibold tracking-tight sm:inline">
            {BRAND_NAME}
          </span>
        </>
      }
    />
  );
}
