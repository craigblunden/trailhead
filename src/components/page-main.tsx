import { cn } from "@/lib/utils";

/**
 * The frame every signed-in section is laid out in: the header's width and gutters, so moving
 * between Board, Contacts, and Documents never moves the page title sideways. Content that reads
 * better narrower caps itself inside, left-aligned, rather than narrowing the frame.
 *
 * A page with a header of its own above the frame, inside its `<main>`, lays the frame out as a `div`.
 */
export function PageMain({
  as: Element = "main",
  className,
  children,
}: {
  as?: "main" | "div";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Element className={cn("mx-auto w-full max-w-[110rem] flex-1 px-4 py-8 sm:px-6", className)}>{children}</Element>
  );
}
