"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ResumeFieldProps = {
  id: string;
  /** Filename currently staged, or `null` for the empty dropzone. */
  value: string | null;
  onChange: (fileName: string | null) => void;
};

/**
 * Records which resume went out with an application. Only the filename is kept
 * — there is nowhere to upload the file to yet.
 */
export function ResumeField({ id, value, onChange }: ResumeFieldProps) {
  const [dragging, setDragging] = useState(false);

  if (value) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>Resume used</Label>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-2.5">
          <FileText
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-sm">{value}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Remove {value}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Resume used</Label>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onChange(file.name);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-input bg-muted/40 px-4 py-7 text-center transition-colors hover:bg-muted/70 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          dragging && "border-primary bg-accent",
        )}
      >
        <input
          id={id}
          type="file"
          accept=".pdf,.docx"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChange(file.name);
          }}
        />
        <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm">Drop your resume here or click to browse</span>
        <span className="text-xs text-muted-foreground">PDF or DOCX</span>
      </label>
    </div>
  );
}
