import { cn } from "@/lib/utils";

/**
 * The frame every signed-in section is laid out in: the header's width and gutters, so moving
 * between Board, Contacts, and Documents never moves the page title sideways. Content that reads
 * better narrower caps itself inside, left-aligned, rather than narrowing the frame.
 */
export function PageMain({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <main className={cn("mx-auto w-full max-w-[110rem] flex-1 px-4 py-8 sm:px-6", className)}>{children}</main>;
}
