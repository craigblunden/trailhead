import Link from "next/link";

import { HikerMark } from "@/components/hiker-mark";
import { cn } from "@/lib/utils";

type TrailheadLogoProps = {
  size?: "sm" | "lg";
  /** Renders as a link to `href`; omit for a plain, non-interactive mark. */
  href?: string;
  className?: string;
};

const MARK = {
  sm: "size-7",
  lg: "size-9",
} as const;

const WORD = {
  sm: "text-xl",
  lg: "text-2xl",
} as const;

export function TrailheadLogo({
  size = "sm",
  href,
  className,
}: TrailheadLogoProps) {
  const content = (
    <>
      <HikerMark className={cn("shrink-0", MARK[size])} />
      <span className={cn("font-heading font-semibold tracking-tight", WORD[size])}>
        Trailhead
      </span>
    </>
  );

  if (!href) {
    return (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {content}
    </Link>
  );
}
