"use client";

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { accountClient } from "@/components/account/account-actions-client";
import { DeleteAccount } from "@/components/account/delete-account";
import { PlanComparison } from "@/components/account/plan-comparison";
import { RequestUpgrade } from "@/components/account/request-upgrade";
import { AppHeader } from "@/components/app-header";
import { BrandLogo } from "@/components/brand-logo";
import { useLimits } from "@/components/documents/documents-provider";
import { LoadingTrail } from "@/components/loading-trail";
import { PageMain } from "@/components/page-main";
import { LegalLinks } from "@/components/site-footer";
import { PlanMark } from "@/components/plan-mark";
import { Button } from "@/components/ui/button";
import {
  documentsHeldLine,
  interviewLengthsLine,
  interviewsLeftLine,
  lettersLeftLine,
  signInMethodLabels,
} from "@/lib/account";
import { accountCache, interviewsCache, lettersCache } from "@/lib/account-client";
import { canStartAttempt } from "@/lib/interview";
import { cn } from "@/lib/utils";

/**
 * `/account`: who is signed in, the Tenant's Plan and what it holds against its Limits, the Plans
 * that can one day be paid for, and — last, and set apart — Account deletion. Reached from the user
 * menu only.
 */
export function AccountView() {
  const summary = useQuery(accountCache.options(accountClient.summary));
  const limits = useLimits();
  const letters = useQuery(lettersCache.options(accountClient.letters));
  const account = summary.data;
  // ADR-0005: a Plan that cannot start an Attempt is shown no count, so its count is never read.
  const canInterview = account ? canStartAttempt(account.plan) : false;
  const interviews = useQuery({ ...interviewsCache.options(accountClient.interviews), enabled: canInterview });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} />

      <PageMain>
        <h1 className="text-3xl tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who you’re signed in as, your plan, and deleting your account.</p>

        {summary.isError ? (
          <div role="alert" className="mt-6 max-w-3xl rounded-md border border-dashed border-border p-4 text-sm">
            <p>We couldn’t load your account.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => summary.refetch()}>
              Try again
            </Button>
          </div>
        ) : !account ? (
          <LoadingTrail className="mt-6">Loading your account…</LoadingTrail>
        ) : (
          <div className="mt-6 max-w-3xl space-y-6">
            <Section title="Your account">
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="break-words">{account.name}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-words">{account.email}</dd>
                <dt className="text-muted-foreground">Signs in with</dt>
                <dd>{signInMethodLabels(account.providers).join(", ")}</dd>
              </dl>
            </Section>

            <Section title="Your plan">
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Plan</dt>
                <dd>
                  <PlanMark plan={account.plan} className="text-sm" />
                </dd>
                <dt className="text-muted-foreground">Documents</dt>
                <dd>
                  {limits.data
                    ? documentsHeldLine(account.documents, limits.data.documents)
                    : limits.isError
                      ? "We couldn’t check your documents limit."
                      : "Checking…"}
                </dd>
                <dt className="text-muted-foreground">Cover letters</dt>
                <dd>
                  {letters.data
                    ? lettersLeftLine(letters.data)
                    : letters.isError
                      ? "We couldn’t check your cover letters."
                      : "Checking…"}
                </dd>
                <dt className="text-muted-foreground">Interviews</dt>
                <dd>
                  {!canInterview
                    ? "The Interview Simulator is a Pro feature"
                    : interviews.data
                      ? interviewsLeftLine(interviews.data)
                      : interviews.isError
                        ? "We couldn’t check your interviews."
                        : "Checking…"}
                </dd>
                {canInterview && (
                  <>
                    <dt className="text-muted-foreground">Interview lengths</dt>
                    <dd>
                      {limits.data
                        ? interviewLengthsLine(limits.data.interviewLengths)
                        : limits.isError
                          ? "We couldn’t check your interview lengths."
                          : "Checking…"}
                    </dd>
                  </>
                )}
              </dl>

              {/* Asking is the only way onto a Plan today, so the ask sits with the Plan it is about. */}
              <RequestUpgrade summary={account} className="mt-4" />
            </Section>

            {/* Linked to from elsewhere — a Practice round's end — so it has an address of its own. */}
            <Section title="Plans — coming soon" id="plans">
              <PlanComparison summary={account} />
            </Section>

            <Section title="Delete account" className="mt-10 ring-destructive/30">
              <p className="mt-1 text-sm text-muted-foreground">
                End your account and erase everything in it — every job, contact, document, and draft — at once
                and for good.
              </p>
              <DeleteAccount summary={account} />
            </Section>

            {/* What you agreed to when you signed in, readable again without leaving the app. */}
            <LegalLinks className="mt-2 justify-start" />
          </div>
        )}
      </PageMain>
    </div>
  );
}

function Section({
  title,
  id,
  className,
  children,
}: {
  title: string;
  /** The section's fragment, for a section other pages link to. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-20 rounded-lg bg-card p-5 ring-1 ring-foreground/10", className)}
    >
      <h2 id={headingId} className="text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}
