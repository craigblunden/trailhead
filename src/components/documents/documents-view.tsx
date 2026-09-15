"use client";

import { useState } from "react";
import { Download, FileText, Trash2 } from "lucide-react";

import { describeFailure } from "@/components/action-client";
import { AppHeader } from "@/components/app-header";
import { useDocumentActions, useDocumentList, useLimits } from "@/components/documents/documents-provider";
import { UploadDocument } from "@/components/documents/upload-document";
import { BrandLogo } from "@/components/brand-logo";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOCUMENT_KIND_LABEL, formatBytes, type DocumentSummary } from "@/lib/documents";
import { formatShortDate, pluralize } from "@/lib/jobs";

/**
 * `/documents`: every Document the user holds, the one place Delete lives (ticket 13), and an
 * upload control that shows a finite Limit before it is reached.
 */
export function DocumentsView() {
  const documents = useDocumentList();
  const limits = useLimits();
  /** The Tenant's Document Limit; null until it is known. */
  const limit = limits.data?.documents ?? null;
  const { remove, open } = useDocumentActions();
  const [confirming, setConfirming] = useState<DocumentSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function download(document: DocumentSummary) {
    setFailure(null);
    try {
      await open(document.id);
    } catch (error) {
      setFailure(describeFailure(error, "That download link couldn't be made. Try again."));
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    const target = confirming;
    setFailure(null);
    try {
      await remove.mutateAsync(target.id);
      setConfirming(null);
    } catch (error) {
      setConfirming(null);
      setFailure(describeFailure(error, `${target.fileName} wasn't deleted. Check your connection and try again.`));
    }
  }

  const held = documents.data?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />

      <PageMain>
        <h1 className="text-3xl tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your resumes and cover letters{typeof limit === "number" && ` — up to ${limit} at a time`}. Attach
          them to jobs from each job’s page.
        </p>

        {failure && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm"
          >
            <span>{failure}</span>
            <Button variant="outline" size="sm" onClick={() => setFailure(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Upload first in reading order; on wide screens it stands beside the list, as a job
            page’s side cards do. */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section
            aria-labelledby="upload-heading"
            className="rounded-lg bg-card p-5 ring-1 ring-foreground/10 lg:col-start-2 lg:row-start-1"
          >
            <h2 id="upload-heading" className="text-lg">
              Upload
            </h2>
            {documents.isPending || limit === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Checking how many slots are free…</p>
            ) : (
              <UploadDocument held={held} limit={limit} className="mt-3" />
            )}
          </section>

          <section aria-labelledby="documents-heading" className="min-w-0 lg:col-start-1 lg:row-start-1">
            <h2 id="documents-heading" className="text-lg">
              On file{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {typeof limit === "number" ? `${held} of ${limit}` : pluralize(held, "document")}
              </span>
            </h2>

            {documents.isPending ? (
              <LoadingTrail className="mt-3">Loading your documents…</LoadingTrail>
            ) : documents.isError ? (
              <div role="alert" className="mt-3 rounded-md border border-dashed border-border p-4 text-sm">
                <p>We couldn’t load your documents.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => documents.refetch()}>
                  Try again
                </Button>
              </div>
            ) : documents.data.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing on file yet. Upload the resume you send most, then attach it to any job.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {documents.data.map((document) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-start gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10"
                  >
                    <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-bold break-words">{document.fileName}</p>
                      <p className="text-sm text-muted-foreground">
                        {DOCUMENT_KIND_LABEL[document.kind]} · {formatBytes(document.sizeBytes)} · Uploaded{" "}
                        {formatShortDate(document.uploadedOn)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {document.status === "pending"
                          ? "This upload didn’t finish. Delete it and try again."
                          : document.jobs.length === 0
                            ? "Not attached to any job"
                            : `On ${pluralize(document.jobs.length, "job")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Explicit labels: an adjacent sr-only span loses its leading space in JSX
                          and would be announced as "Deleteresume.pdf". */}
                      {document.status === "ready" && (
                        <Button
                          variant="outline"
                          className="h-9 px-3"
                          aria-label={`Download ${document.fileName}`}
                          onClick={() => download(document)}
                        >
                          <Download aria-hidden="true" />
                          Download
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="h-9 px-3 text-destructive"
                        aria-label={`Delete ${document.fileName}`}
                        onClick={() => setConfirming(document)}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageMain>

      <Dialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent className="gap-0 p-6 sm:max-w-md">
          {confirming && (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl break-words">Delete {confirming.fileName}?</DialogTitle>
                <DialogDescription>
                  {confirming.jobs.length === 0
                    ? "It isn't attached to any job. The file is removed for good."
                    : `It's attached to ${pluralize(confirming.jobs.length, "job")}. Those jobs stay — they just won't have this document attached. The file is removed for good.`}
                </DialogDescription>
              </DialogHeader>
              {confirming.jobs.length > 0 && (
                <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
                  {confirming.jobs.map((job) => (
                    <li key={job.id}>
                      {job.role} · {job.company}
                    </li>
                  ))}
                </ul>
              )}
              <DialogFooter className="mx-0 mb-0 gap-2 border-t-0 bg-transparent p-0 pt-2">
                <Button variant="outline" className="h-10 px-4" onClick={() => setConfirming(null)}>
                  Keep it
                </Button>
                <Button
                  variant="destructive"
                  className="h-10 px-4"
                  disabled={remove.isPending}
                  onClick={confirmDelete}
                >
                  {remove.isPending ? "Deleting…" : "Delete document"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
