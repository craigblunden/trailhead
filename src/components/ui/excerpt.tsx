import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Saved text that opens to a few clamped lines, with a button to see the rest. `expanded` and
 * `onToggle` are the caller's: a Draft that only ever views can pass `expandedLabel` for a button
 * that folds it back, while text that instead becomes an editable field once expanded omits
 * `expandedLabel` — nothing then reverses `expanded` except the caller's own save.
 *
 * `children` carries its own `id` (matching `controlsId`), since a field's expanded shape — a
 * Textarea, a read-only region — is too different between callers for this component to wrap it.
 */
export function Excerpt({
  expanded,
  onToggle,
  collapsedLabel,
  expandedLabel,
  controlsId,
  preview,
  previewClassName,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  collapsedLabel: string;
  expandedLabel?: string;
  controlsId: string;
  preview: string;
  previewClassName?: string;
  children: React.ReactNode;
}) {
  const showToggle = !expanded || expandedLabel;

  return (
    <>
      {expanded ? (
        children
      ) : (
        <p className={cn("line-clamp-3 text-sm leading-relaxed", previewClassName)}>
          {preview}
        </p>
      )}
      {showToggle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          aria-expanded={expanded}
          aria-controls={expanded ? controlsId : undefined}
          onClick={onToggle}
        >
          {expanded ? expandedLabel : collapsedLabel}
          <ChevronDown aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
        </Button>
      )}
    </>
  );
}
