import { ACCENTS, initials, type Accent } from "@/lib/jobs";
import { cn } from "@/lib/utils";

type CompanyAvatarProps = {
  company: string;
  accent: Accent;
  size?: "sm" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-7 rounded-sm text-xs",
  lg: "size-12 rounded-md text-xl",
} as const;

/** Decorative stand-in for a company logo — the company name is always
 *  rendered as text alongside it, so this is hidden from assistive tech. */
export function CompanyAvatar({
  company,
  accent,
  size = "sm",
  className,
}: CompanyAvatarProps) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: ACCENTS[accent] }}
      className={cn(
        "grid shrink-0 place-items-center font-heading font-semibold text-white",
        SIZES[size],
        className,
      )}
    >
      {initials(company)}
    </span>
  );
}
