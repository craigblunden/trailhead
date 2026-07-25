import { cn } from "@/lib/utils";

/** Compact fact tag used on job cards — location, salary band, and the like. */
export function MetaChip({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-chip px-2 py-1 text-xs leading-none text-chip-foreground",
        className,
      )}
      {...props}
    />
  );
}
