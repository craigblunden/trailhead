"use client";

import { useId } from "react";

import {
  useDocumentList,
  useJobDocuments,
  useLimits,
} from "@/components/documents/documents-provider";
import { UploadDocument } from "@/components/documents/upload-document";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DOCUMENT_KIND_LABEL,
  type DocumentKind,
  type DocumentSummary,
} from "@/lib/documents";
import { pluralize, type AttachedDocument, type Job } from "@/lib/jobs";

/**
 * What goes out with this Job (ticket 13's decision, built by ticket 17): a radio list per kind —
 * Nothing, then each document on file with how many jobs use it — so the same resume goes with as
 * many jobs as the user likes without uploading it again. Uploading is the exception, a secondary
 * row beneath, and a new upload lands attached. Delete is not here; it lives on `/documents`.
 */
export function ApplicationKitCard({ job }: { job: Job }) {
  const documents = useDocumentList();
  const limits = useLimits();
  const kit = useJobDocuments(job.id);

  return (
    <Card role="region" aria-labelledby="kit-heading" className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id="kit-heading">Application kit</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {kit.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm"
          >
            <span>{kit.error}</span>
            <Button variant="outline" size="sm" onClick={kit.dismissError}>
              Dismiss
            </Button>
          </div>
        )}

        {documents.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your documents…
          </p>
        ) : documents.isError ? (
          <div role="alert" className="text-sm">
            <p>We couldn’t load your documents.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => documents.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <KindChoice
              kind="resume"
              attached={job.resume}
              selectedId={kit.selected("resume", job.resume?.id ?? null)}
              documents={documents.data}
              onChoose={(id) => kit.choose("resume", id)}
            />
            <KindChoice
              kind="cover_letter"
              attached={job.coverLetter}
              selectedId={kit.selected("cover_letter", job.coverLetter?.id ?? null)}
              documents={documents.data}
              onChoose={(id) => kit.choose("cover_letter", id)}
            />
            <section aria-labelledby="kit-upload-heading" className="border-t border-border pt-4">
              <h3 id="kit-upload-heading" className="font-sans text-sm font-bold">
                Upload another
              </h3>
              {limits.data ? (
                <UploadDocument
                  held={documents.data.length}
                  limit={limits.data.documents}
                  manageHref="/documents"
                  className="mt-2"
                  onUploaded={(document) => kit.choose(document.kind, document.id, document.fileName)}
                />
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Checking how many slots are free…</p>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function usedBy(document: DocumentSummary): string {
  return document.jobs.length === 0 ? "Not on any job yet" : `On ${pluralize(document.jobs.length, "job")}`;
}

function KindChoice({
  kind,
  attached,
  selectedId,
  documents,
  onChoose,
}: {
  kind: DocumentKind;
  /** What the server has attached. */
  attached: AttachedDocument | null;
  /** What to show as chosen — the user's pending pick, else `attached`. */
  selectedId: string | null;
  documents: DocumentSummary[];
  onChoose: (documentId: string | null) => void;
}) {
  const name = useId();
  const label = DOCUMENT_KIND_LABEL[kind];
  const options = documents.filter((document) => document.kind === kind && document.status === "ready");
  // A just-attached upload can arrive a moment before the list refetches; never hide the choice made.
  const missing = attached && !options.some((document) => document.id === attached.id) ? attached : null;

  return (
    <fieldset>
      <legend className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </legend>
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="radio"
            name={name}
            checked={selectedId === null}
            onChange={() => onChoose(null)}
            className="size-4 shrink-0 accent-primary"
          />
          Nothing
        </label>
        {options.map((document) => (
          <label key={document.id} className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name={name}
              checked={selectedId === document.id}
              onChange={() => onChoose(document.id)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium break-words">{document.fileName}</span>
              <span className="block text-xs text-muted-foreground">{usedBy(document)}</span>
            </span>
          </label>
        ))}
        {missing && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name={name}
              checked={selectedId === missing.id}
              onChange={() => onChoose(missing.id)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="block min-w-0 font-medium break-words">{missing.fileName}</span>
          </label>
        )}
      </div>
      {options.length === 0 && !missing && (
        <p className="mt-1.5 text-xs text-muted-foreground">No {label.toLowerCase()} on file yet.</p>
      )}
    </fieldset>
  );
}
