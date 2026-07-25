import Link from "next/link";

import { cn } from "@/lib/utils";

type TrailheadLogoProps = {
  size?: "sm" | "lg";
  /** Renders as a link to `href`; omit for a plain, non-interactive mark. */
  href?: string;
  className?: string;
};

const MARK = {
  sm: "size-7 text-[0.9rem]",
  lg: "size-9 text-lg",
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
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-primary font-heading leading-none text-primary-foreground",
          MARK[size],
        )}
      >
        T
      </span>
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
