"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { accountClient } from "@/components/account/account-actions-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deletionContents, emailsMatch, type AccountSummary } from "@/lib/account";
import { PLAN_LABEL } from "@/lib/plans";

const DELETE_FAILED = "Your account wasn’t deleted. Check your connection and try again.";

/**
 * Account deletion (CONTEXT.md): the dialog says what goes, with counts; names a paid Plan that goes
 * with it; points at Documents for anyone who wants their files first; and enables the destructive
 * button only once the Account's email is typed. The server checks the email again.
 *
 * On success the action redirects to the landing page, so the wait simply lasts until the page
 * leaves. While it lasts the dialog cannot be dismissed or sent again; a refusal is shown inside it
 * with what was typed kept.
 */
export function DeleteAccount({ summary }: { summary: AccountSummary }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = emailsMatch(typed, summary.email);

  function openChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setFailure(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !matches) return;
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await accountClient.remove(typed);
        if (result && !result.ok) setFailure(result.message);
      } catch {
        setFailure(DELETE_FAILED);
      }
    });
  }

  return (
    <>
      <Button variant="destructive" className="mt-4 h-9 px-4" onClick={() => setOpen(true)}>
        Delete account…
      </Button>

      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent
          className="gap-0 p-6 sm:max-w-md"
          showCloseButton={!pending}
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onInteractOutside={(event) => pending && event.preventDefault()}
        >
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">Delete your account?</DialogTitle>
            <DialogDescription>
              Everything goes, at once and for good: {deletionContents(summary)} — with their history, notes, and
              drafts.
            </DialogDescription>
          </DialogHeader>

          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
            {summary.plan !== "free" && <li>Your {PLAN_LABEL[summary.plan]} ends with your account.</li>}
            <li>
              Want your files? Download them from{" "}
              <Link href="/documents" className="font-medium underline underline-offset-2">
                Documents
              </Link>{" "}
              first.
            </li>
            <li>Feedback you’ve already sent us isn’t recalled.</li>
            <li className="font-medium">This can’t be undone.</li>
          </ul>

          <form onSubmit={submit}>
            <Label htmlFor={fieldId} className="leading-snug">
              Type {summary.email} to confirm
            </Label>
            <Input
              id={fieldId}
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-2"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              readOnly={pending}
            />

            {failure && (
              <p role="alert" className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-sm">
                {failure}
              </p>
            )}

            <DialogFooter className="mx-0 mt-5 mb-0 gap-2 border-t-0 bg-transparent p-0">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                disabled={pending}
                onClick={() => openChange(false)}
              >
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" className="h-10 px-4" disabled={pending || !matches}>
                {pending ? "Deleting your account…" : "Delete my account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
