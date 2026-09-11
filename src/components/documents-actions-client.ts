import { ActionError, unwrap } from "@/components/action-client";
import { DOCUMENTS_BUCKET, UPLOAD_REFUSALS } from "@/lib/documents";
import type { DocumentsClient } from "@/lib/documents-client";
import { supabasePublicEnv } from "@/lib/supabase-env";
import {
  deleteDocumentAction,
  documentLinkAction,
  finishUploadAction,
  listDocumentsAction,
  setJobDocumentAction,
  startUploadAction,
} from "@/server/actions/documents";

/** A Storage refusal on the signed upload, in the same words the server would have used. */
function storageRefusal(error: { status?: number; statusCode?: string; message?: string }): ActionError {
  const status = Number(error.statusCode ?? error.status);
  if (status === 413) return new ActionError("rejected", UPLOAD_REFUSALS["too-large"], {}, "too-large");
  if (status === 415) {
    return new ActionError("rejected", UPLOAD_REFUSALS["unsupported-type"], {}, "unsupported-type");
  }
  return new ActionError("rejected", UPLOAD_REFUSALS["upload-missing"], {}, "upload-missing");
}

/**
 * Documents over Server Actions, with the upload's bytes going from this browser straight to
 * Storage through the signed upload URL the server minted. No action and no route handler ever
 * receives the file: a request body through Vercel is capped below the 5 MB this app accepts.
 */
export function createActionsDocumentsClient(): DocumentsClient {
  return {
    list: async () => unwrap(await listDocumentsAction()),

    upload: async (file, kind, onStage) => {
      const ticket = unwrap(await startUploadAction({ kind, fileName: file.name, sizeBytes: file.size }));

      onStage?.("uploading");
      const { url, publishableKey } = supabasePublicEnv();
      // Loaded here rather than at the top: this PUT is the only use of the Supabase client in the
      // browser, and every signed-in page would otherwise ship it (performance ticket 01).
      const { createBrowserClient } = await import("@supabase/ssr");
      const storage = createBrowserClient(url, publishableKey).storage.from(DOCUMENTS_BUCKET);
      const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: ticket.contentType,
      });
      if (error) {
        // Nothing arrived, so the pending row can go now rather than waiting for the sweep.
        await deleteDocumentAction(ticket.documentId).catch(() => undefined);
        throw storageRefusal(error as { status?: number; statusCode?: string });
      }

      onStage?.("reading");
      return unwrap(await finishUploadAction(ticket.documentId));
    },

    remove: async (id) => {
      unwrap(await deleteDocumentAction(id));
    },

    link: async (id) => unwrap(await documentLinkAction(id)),

    attach: async (jobId, kind, documentId) =>
      unwrap(await setJobDocumentAction(jobId, kind, documentId)),
  };
}
