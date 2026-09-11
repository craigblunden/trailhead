"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { useDocumentUpload } from "@/components/documents/documents-provider";
import { Button } from "@/components/ui/button";
import {
  ACCEPT_ATTRIBUTE,
  DOCUMENT_CAP,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  roomLeft,
  type DocumentKind,
  type DocumentSummary,
} from "@/lib/documents";
import { cn } from "@/lib/utils";

type UploadDocumentProps = {
  /** How many Documents the user already holds, to express the cap before it is hit. */
  held: number;
  defaultKind?: DocumentKind;
  /** Called with the new Document once its text has been read. */
  onUploaded?: (document: DocumentSummary) => void;
  /** Where the at-cap line points; omit on the documents page itself. */
  manageHref?: string;
  className?: string;
};

/**
 * Upload a PDF or DOCX. The cap is shown wherever upload is offered ("Room for 1 more"), and at the
 * cap the control is replaced by a line saying so, so a fourth upload cannot even be attempted
 * (ticket 13). Each stage is announced; a refusal is announced as an alert naming what to do.
 */
export function UploadDocument({
  held,
  defaultKind = "resume",
  onUploaded,
  manageHref,
  className,
}: UploadDocumentProps) {
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const { state, upload } = useDocumentUpload({ onUploaded });
  const busy = state.phase === "uploading" || state.phase === "reading";
  const room = roomLeft(held);

  if (!room && !busy) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        All {DOCUMENT_CAP} slots used
        {manageHref ? (
          <>
            {" · "}
            <Link
              href={manageHref}
              className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Manage documents
            </Link>
          </>
        ) : (
          ". Delete a document you no longer send to upload another."
        )}
      </p>
    );
  }

  const status =
    state.phase === "uploading"
      ? `Uploading ${state.fileName}…`
      : state.phase === "reading"
        ? `Reading the text in ${state.fileName}…`
        : state.phase === "done"
          ? `${state.fileName} is ready.`
          : "";

  return (
    <div className={cn("space-y-3", className)}>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2" disabled={busy}>
        <legend className="mb-1.5 text-sm font-medium">What is it?</legend>
        {DOCUMENT_KINDS.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${fieldId}-kind`}
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
              className="size-4 accent-primary"
            />
            {DOCUMENT_KIND_LABEL[option]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={`${fieldId}-file`}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-describedby={`${fieldId}-hint`}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file, kind);
          }}
        />
        <Button asChild variant="outline" className={cn("h-10 px-4", busy && "pointer-events-none opacity-50")}>
          <label htmlFor={`${fieldId}-file`} className="cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <Upload aria-hidden="true" />
            {busy ? "Uploading…" : "Choose a file to upload"}
          </label>
        </Button>
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          PDF or .docx, up to 5 MB · {room ?? "Last slot"}
        </p>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      {state.phase === "failed" && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
          <span className="font-medium">{state.fileName}:</span> {state.message}
        </p>
      )}
    </div>
  );
}
