"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { StageMarker } from "@/components/board/trail-marker";
import { BrandLogo } from "@/components/brand-logo";
import { CompanyAvatar } from "@/components/company-avatar";
import { SummitHeaderFrame } from "@/components/job/summit-header";
import { PageMain } from "@/components/page-main";
import { PageWait } from "@/components/page-wait";
import { Button } from "@/components/ui/button";
import { kindLine, type ContactListItem } from "@/lib/contacts";
import { contactsCache } from "@/lib/contacts-client";
import { limitsCache } from "@/lib/documents-client";
import { ACTIVE_STAGES, STAGES, STAGE_META, pluralize, type Job, type Stage } from "@/lib/jobs";
import { jobsCache } from "@/lib/jobs-cache";
import type { Limits } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * What a signed-in page shows the moment someone navigates to it, while the server checks the
 * session and reads the page's data (performance ticket 02).
 *
 * It is the destination page with its data not yet written: the same header, the same grid, the
 * same cards, in outline. So when the page arrives nothing moves; the outline fills in. A section's
 * own title and the line beneath it are fixed words, so they are written, not outlined. Where the
 * browser already holds the answer — a Job's name from the board it just left, a Contact's name
 * from the list beside it — it is shown at once rather than drawn as a bar. The one thing that
 * moves is the hiker on the trail, beside a sentence that says what is on its way, and it always
 * stands in the header beside the account menu (see `PageWait`), never somewhere in the page.
 *
 * The route is read from the URL because a loading state is handed no params, and one file covers
 * every section (see `(app)/loading.tsx`). Nothing here is interactive except the way back: a live
 * control drawn here would be replaced under the user's click when the page arrives.
 */
export function PageLoading() {
  const pathname = usePathname() ?? "";

  if (pathname === "/board") return <BoardLoading />;
  if (pathname.startsWith("/board/")) return <JobLoading id={pathname.slice("/board/".length)} />;
  if (pathname.startsWith("/contacts")) return <ContactsLoading selectedId={contactIdIn(pathname)} />;
  if (pathname.startsWith("/documents")) return <DocumentsLoading />;
  if (pathname === "/interview") return <InterviewLoading id={null} />;
  if (pathname === "/interview/practice") return <PracticeLoading />;
  if (pathname.startsWith("/interview/practice/")) return <PracticeLoading saved />;
  if (pathname === "/interview/tutorial") return <TutorialLoading />;
  if (pathname.startsWith("/interview/")) {
    const [jobId, attemptId] = pathname.slice("/interview/".length).split("/");
    return attemptId ? <PastInterviewLoading jobId={jobId} /> : <InterviewLoading id={jobId} />;
  }
  if (pathname.startsWith("/account")) return <AccountLoading />;
  // A section this file does not know yet: say so plainly rather than draw another page's outline.
  return <SectionLoading />;
}

/** The Contact a `/contacts/…` URL is about, or null on the list's own URL. */
function contactIdIn(pathname: string): string | null {
  return pathname.slice("/contacts/".length) || null;
}

function SectionLoading() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading…</PageWait>
      <PageMain />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The outline's vocabulary: a bar where text will be, a button-shaped space in the header.
 * Bars are empty elements, so assistive tech has nothing to read in them. Anything that carries
 * text for the eye alone says so.
 * ---------------------------------------------------------------------------------------------- */

function Bar({ className }: { className?: string }) {
  return <span className={cn("block rounded-sm bg-foreground/8", className)} />;
}

/**
 * A section's title and the line beneath it, in the page's own classes so they land exactly where
 * the page will draw them. For the eye only, like the Stage names: the page's heading announces
 * itself when it arrives.
 */
function SectionTitle({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="font-heading text-3xl tracking-tight">
      {children}
    </p>
  );
}

function SectionLede({ children }: { children: React.ReactNode }) {
  return (
    <p aria-hidden="true" className="mt-1 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** A card's own title, written, for the eye only like the section's. */
function CardTitle({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="font-heading text-lg">
      {children}
    </p>
  );
}

/**
 * A page's title when the browser already knows it: the heading's type, but not a heading, since
 * that is the page's to render. `font-heading` is spelled out because only real headings inherit it.
 */
function GhostTitle({ children, width }: { children?: string; width: string }) {
  if (!children) return <Bar className={cn("mt-1 h-7 max-w-full", width)} />;
  return <p className="font-heading text-3xl leading-tight tracking-tight text-balance">{children}</p>;
}

/** A card exactly as the pages draw one, holding the outline of its content. */
function GhostCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-lg bg-card p-5 ring-1 ring-foreground/10", className)}>{children}</div>;
}

/** A card's heading and a few lines beneath it. */
function GhostCardBody({ lines = 2 }: { lines?: number }) {
  return (
    <GhostCard>
      <Bar className="h-5 w-32" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={cn("h-3.5", i % 2 === 0 ? "w-full" : "w-2/3")} />
        ))}
      </div>
    </GhostCard>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The board: five columns, each with as many card outlines as the browser last saw at that Stage.
 * ---------------------------------------------------------------------------------------------- */

/** Card outlines per column when the browser has never seen this user's jobs. */
const UNSEEN_COLUMNS: Record<Stage, number> = {
  interested: 2,
  applied: 2,
  interviewing: 1,
  offer: 1,
  rejected: 1,
};

const MOST_GHOST_CARDS = 6;

function BoardLoading() {
  const queryClient = useQueryClient();
  const seen = queryClient.getQueryData<Job[]>(jobsCache.key);
  const counts = seen
    ? Object.fromEntries(
        STAGES.map((stage) => [stage, Math.min(MOST_GHOST_CARDS, seen.filter((job) => job.stage === stage).length)]),
      )
    : UNSEEN_COLUMNS;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading your trail…</PageWait>

      <PageMain>
        {/* The title row: the heading, the count of active jobs when the browser last saw them, and
            Add job's space at the end. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <SectionTitle>Your trail</SectionTitle>
            {seen ? (
              <p aria-hidden="true" className="text-sm text-muted-foreground">
                {pluralize(seen.filter((job) => ACTIVE_STAGES.includes(job.stage)).length, "active application")}
              </p>
            ) : (
              <Bar className="h-3.5 w-32 self-center" />
            )}
          </div>
          <Bar className="h-9 w-24 rounded-lg" />
        </div>

        <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((stage) => (
            <div key={stage} className="relative flex h-fit flex-col rounded-lg bg-card/55 ring-1 ring-foreground/10">
              <StageMarker stage={stage} />
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: STAGE_META[stage].dot }}
                  className="size-2 shrink-0 rounded-full"
                />
                {/* The Stages are fixed, so their names are known before any data is. Said for the
                    eye only: the page's own headings announce them when they arrive. */}
                <span
                  aria-hidden="true"
                  className="font-sans text-xs font-bold tracking-widest text-muted-foreground uppercase"
                >
                  {STAGE_META[stage].label}
                </span>
                <Bar className="ml-auto h-4 w-5 bg-muted" />
              </div>
              {counts[stage] === 0 ? (
                <div className="px-3 py-6">
                  <Bar className="mx-auto h-3 w-28" />
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-3">
                  {Array.from({ length: counts[stage] }, (_, i) => (
                    <GhostJobCard key={i} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </PageMain>
    </div>
  );
}

function GhostJobCard() {
  return (
    <div className="rounded-md bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-start gap-2.5">
        <Bar className="size-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Bar className="h-3.5 w-3/4" />
          <Bar className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Bar className="h-5 w-20 bg-chip" />
        <Bar className="h-5 w-16 bg-chip" />
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <Bar className="h-3 w-24" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * A Job's page: its name, company, and Stage's sky from the board the user just left, and the
 * header's strip and the cards in outline. The scene itself arrives with the page.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Also the job page's own wait, for the rare load where the browser holds no jobs at all.
 *
 * `job` lets a caller that already has the Job — `JobDetail`, following a redirect to a Job's
 * saved id — hand it over directly, rather than this component reading the cache a second time
 * under a different id. Two independent reads of the same cache, gated by different conditions,
 * can disagree about what "now" holds; a second, later render then finds them inconsistent with
 * each other, which shows up as a hydration mismatch. Omitted, this falls back to its own lookup
 * by `id` — the route's `loading.tsx`, shown before `JobDetail` itself has mounted, has nothing
 * else to hand it.
 */
export function JobLoading({ id, job: known }: { id: string; job?: Job }) {
  const queryClient = useQueryClient();
  const job = known ?? queryClient.getQueryData<Job[]>(jobsCache.key)?.find((candidate) => candidate.id === id);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading this job…</PageWait>

      <main className="flex flex-1 flex-col">
        {/* The way back is live inside it, as on the page itself. */}
        <SummitHeaderFrame
          stage={job?.stage ?? null}
          title={
            <>
              {job ? (
                <CompanyAvatar
                  company={job.company}
                  accent={job.accent}
                  size="lg"
                  className="lg:size-16 lg:rounded-lg lg:text-3xl"
                />
              ) : (
                <Bar className="size-12 shrink-0 rounded-md lg:size-16 lg:rounded-lg" />
              )}
              <div className="min-w-0">
                {job ? (
                  <>
                    <p className="font-heading text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl 2xl:text-6xl">
                      {job.role}
                    </p>
                    <p className="mt-1 sm:text-lg lg:mt-2 lg:text-xl">
                      {job.company} · {job.location}
                    </p>
                  </>
                ) : (
                  <>
                    <Bar className="mt-1 h-7 w-64 max-w-full sm:h-9 lg:h-12" />
                    <Bar className="mt-3 h-4 w-44 lg:h-5" />
                  </>
                )}
              </div>
            </>
          }
          progress={
            <>
              <Bar className="h-5 w-72 max-w-full rounded-full" />
              <Bar className="h-4 w-96 max-w-full" />
            </>
          }
          controls={
            <>
              <Bar className="h-9 w-full rounded-lg sm:w-40" />
              <Bar className="h-9 w-32 rounded-lg" />
              <Bar className="h-9 w-32 rounded-lg" />
            </>
          }
        />

        <PageMain as="div">
          {/* The side cards in one column beside the writing, and in two from `2xl`, where one column
              of text boxes would otherwise run the full width of the page. */}
          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_43.5rem]">
            {/* min-w-0: a grid track is never made wider than the screen by what it holds. */}
            <div className="min-w-0 space-y-6">
              {/* The description card is where the wait is shown: the largest space on the page. */}
              <GhostCard>
                <Bar className="h-5 w-36" />
                <Bar className="mt-2.5 h-3.5 w-72 max-w-full" />
                <div className="mt-3 min-h-56 rounded-md border border-dashed border-input" />
                <div className="mt-3 flex justify-end">
                  <Bar className="h-9 w-36 rounded-lg" />
                </div>
              </GhostCard>
              <GhostCard>
                <Bar className="h-5 w-16" />
                <Bar className="mt-3 h-32 w-full rounded-md" />
                <div className="mt-3 flex justify-end">
                  <Bar className="h-9 w-28 rounded-lg" />
                </div>
              </GhostCard>
              {/* The cover letter: its line, the letter block, and the Feedback box and buttons beneath it. */}
              <GhostCard>
                <Bar className="h-5 w-28" />
                <Bar className="mt-2.5 h-3.5 w-full max-w-md" />
                <Bar className="mt-4 h-32 w-full rounded-md" />
                <Bar className="mt-4 h-3.5 w-36" />
                <Bar className="mt-2 h-20 w-full rounded-md" />
                <div className="mt-3 flex gap-3">
                  <Bar className="h-9 w-24 rounded-lg" />
                  <Bar className="h-9 w-28 rounded-lg" />
                </div>
              </GhostCard>
            </div>

            <div className="grid min-w-0 grid-cols-1 items-start gap-6 2xl:grid-cols-2">
              <div className="min-w-0 space-y-6">
                <GhostCardBody lines={4} />
                <GhostCardBody lines={2} />
              </div>
              <div className="min-w-0 space-y-6">
                <GhostCardBody lines={2} />
                <GhostCardBody lines={3} />
              </div>
            </div>
          </div>
        </PageMain>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Contacts: the add card, the list, and the detail, as the page lays them out; below `lg` only the
 * half the URL is about, the same way the page decides. Seen only when the contacts layout was not
 * prefetched; otherwise the layout is already there and `ContactLoading` below is what waits.
 * ---------------------------------------------------------------------------------------------- */

function ContactsLoading({ selectedId }: { selectedId: string | null }) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      {/* One wait is said, not two: the list's here when the list is the point of the URL, and the
          Contact's otherwise, from the detail side. */}
      {!selectedId && <PageWait>Loading your contacts…</PageWait>}

      <PageMain>
        <div className={cn("mb-6", selectedId && "hidden lg:block")}>
          <SectionTitle>Contacts</SectionTitle>
          <SectionLede>The people in your search, each linked to every role they’re part of.</SectionLede>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
          <div className={cn("space-y-6 xl:contents xl:space-y-0", selectedId && "hidden lg:block")}>
            <GhostCard className="xl:col-start-3 xl:row-start-1">
              <CardTitle>Add a contact</CardTitle>
              <p aria-hidden="true" className="mt-1 text-sm text-muted-foreground">
                Just a name and what they are to you. Add the rest on their page.
              </p>
              <div aria-hidden="true" className="mt-4 space-y-4 text-sm leading-none font-medium">
                <div className="space-y-1.5">
                  <p>Name</p>
                  <Bar className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <p>Kind</p>
                  <Bar className="h-10 w-full rounded-lg" />
                </div>
                <Bar className="h-10 w-full rounded-lg" />
              </div>
            </GhostCard>

            <div className="xl:col-start-1 xl:row-start-1">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-md bg-card px-3 py-2.5 ring-1 ring-foreground/10">
                    <Bar className="h-4 w-2/3" />
                    <Bar className="mt-2 h-3 w-1/2" />
                    <Bar className="mt-2 h-3 w-1/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={cn("min-w-0 xl:col-start-2 xl:row-start-1", !selectedId && "hidden lg:block")}>
            {selectedId ? (
              <ContactLoading />
            ) : (
              <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
                <p aria-hidden="true" className="text-sm text-muted-foreground">
                  Choose a contact to see their details and every role they’re part of.
                </p>
              </div>
            )}
          </div>
        </div>
      </PageMain>
    </div>
  );
}

/**
 * The detail side on its own: the list and header stay put in their layout, and only this side
 * waits. This is what most moves into Contacts show, not the section outline above it: Next
 * prefetches a route down to its deepest loading boundary, so the layout and its list are usually
 * in place before the click. The name is taken from that list when the browser holds it.
 *
 * On the list's own URL the pane that will arrive is the "choose a contact" hint, so its outline
 * is drawn, and the wait speaks for the page it belongs to.
 */
export function ContactLoading() {
  const id = contactIdIn(usePathname() ?? "");
  const queryClient = useQueryClient();
  const contact = queryClient
    .getQueryData<ContactListItem[]>(contactsCache.listKey)
    ?.find((candidate) => candidate.id === id);

  if (!id) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <PageWait>Loading your contacts…</PageWait>
        <p aria-hidden="true" className="text-sm text-muted-foreground">
          Choose a contact to see their details and every role they’re part of.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* In the header even here, where the header belongs to the list's layout and stays mounted. */}
      <PageWait>Loading this contact…</PageWait>
      <div>
        {/* The way back, live, as on the page itself: below `lg` the list is hidden behind this side. */}
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3 lg:hidden">
          <Link href="/contacts">
            <ArrowLeft aria-hidden="true" />
            All contacts
          </Link>
        </Button>
        <GhostTitle width="w-56">{contact?.name}</GhostTitle>
        {contact ? (
          <p className="mt-1 text-muted-foreground">
            {kindLine(contact)}
            {contact.title && ` · ${contact.title}`}
          </p>
        ) : (
          <Bar className="mt-3 h-4 w-40" />
        )}
        <Bar className="mt-3 h-3.5 w-48" />
      </div>

      <GhostCard>
        <Bar className="h-5 w-24" />
        <div className="mt-4 min-h-40 rounded-md border border-dashed border-input" />
      </GhostCard>
      <GhostCardBody lines={2} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Documents: what is on file, with the upload card beside it on wide screens and above it on
 * narrow ones.
 * ---------------------------------------------------------------------------------------------- */

function DocumentsLoading() {
  // The Limit is part of the sentence under the title; written when the browser already holds it.
  const limit = useQueryClient().getQueryData<Limits>(limitsCache.key)?.documents;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading your documents…</PageWait>

      <PageMain>
        <SectionTitle>Documents</SectionTitle>
        <SectionLede>
          Your resumes and cover letters{typeof limit === "number" && ` — up to ${limit} at a time`}. Attach
          them to jobs from each job’s page.
        </SectionLede>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <GhostCard className="lg:col-start-2 lg:row-start-1">
            <CardTitle>Upload</CardTitle>
            <Bar className="mt-3 h-28 w-full rounded-md" />
          </GhostCard>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CardTitle>On file</CardTitle>
              <Bar className="h-3.5 w-12" />
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
                  <Bar className="mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Bar className="h-4 w-1/2" />
                    <Bar className="h-3.5 w-3/4" />
                    <Bar className="h-3.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageMain>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The account page: four cards in one narrow column, the last set apart, as the page lays them out.
 * ---------------------------------------------------------------------------------------------- */

/** A card's written title over a short list of label-and-value rows. */
function GhostRows({ title, rows }: { title: string; rows: number }) {
  return (
    <GhostCard>
      <CardTitle>{title}</CardTitle>
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-6">
            <Bar className="h-3.5 w-20" />
            <Bar className={cn("h-3.5", i % 2 === 0 ? "w-48" : "w-36")} />
          </div>
        ))}
      </div>
    </GhostCard>
  );
}

function AccountLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading your account…</PageWait>

      <PageMain>
        <SectionTitle>Account</SectionTitle>
        <SectionLede>Who you’re signed in as, your plan, and deleting your account.</SectionLede>

        <div className="mt-6 max-w-3xl space-y-6">
          <GhostRows title="Your account" rows={3} />
          <GhostRows title="Your plan" rows={3} />
          <GhostCard>
            <CardTitle>Plans — coming soon</CardTitle>
            <Bar className="mt-2.5 h-3.5 w-56" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-md p-4 ring-1 ring-foreground/10">
                  <Bar className="h-4 w-24" />
                  <Bar className="mt-4 h-3.5 w-full" />
                  <Bar className="mt-2.5 h-3.5 w-full" />
                </div>
              ))}
            </div>
          </GhostCard>
          <GhostCard className="mt-10 ring-destructive/30">
            <CardTitle>Delete account</CardTitle>
            <Bar className="mt-2.5 h-3.5 w-full max-w-md" />
            <Bar className="mt-4 h-9 w-36 rounded-lg" />
          </GhostCard>
        </div>
      </PageMain>
    </div>
  );
}

/**
 * `/interview` and `/interview/<job>`: the path, in outline. The heading, the line beneath it, and
 * the steps' titles are fixed words, so they are written; the step contents are bars. With a job in
 * the URL that the board already holds, its role is written in step one at once, and the next steps
 * are drawn open, as the page will draw them.
 */
function InterviewLoading({ id }: { id: string | null }) {
  const cached = useQueryClient().getQueryData<Job[]>(jobsCache.key);
  const job = id ? cached?.find((candidate) => candidate.id === id) : undefined;
  const picked = id !== null;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>{picked ? "Loading your interview…" : "Loading the Interview Simulator…"}</PageWait>

      <PageMain>
        <div className="mx-auto max-w-2xl">
          <SectionTitle>Interview Simulator</SectionTitle>
          <SectionLede>
            Three steps to a rehearsal: a job, how long, and Go. The clock starts once your first question is asked
            and doesn’t pause between them.
          </SectionLede>

          <div className="mt-8">
            <OutlineStep title="Which job?">
              {picked ? (
                <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                  <Bar className="size-8 shrink-0 rounded-full" />
                  {job ? (
                    <p aria-hidden="true" className="min-w-0 flex-1 truncate font-medium">
                      {job.role}
                    </p>
                  ) : (
                    <Bar className="h-4 w-1/2" />
                  )}
                </div>
              ) : (
                <>
                  <Bar className="h-11 w-full rounded-md" />
                  <div className="mt-3 space-y-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                        <Bar className="size-8 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Bar className="h-4 w-1/2" />
                          <Bar className="h-3 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </OutlineStep>
            <OutlineStep title="How do you want to rehearse?">
              {picked && <Bar className="h-14 w-full rounded-md" />}
            </OutlineStep>
            <OutlineStep title="Ready when you are" last>
              {picked && <Bar className="h-12 w-full max-w-sm rounded-md" />}
            </OutlineStep>
          </div>
        </div>
      </PageMain>
    </div>
  );
}

/**
 * `/interview/practice`: a Practice round's set-up, in outline (practice round ticket 03) — or, `saved`, a
 * saved round's read-back at `/interview/practice/<round>` (ticket 05). The way back is live, as on the
 * page; the title is fixed words, so it is written; everything else is bars.
 */
function PracticeLoading({ saved = false }: { saved?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>{saved ? "Loading this practice round…" : "Loading your practice round…"}</PageWait>

      <PageMain>
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/interview">
              <ArrowLeft aria-hidden="true" />
              Interview Simulator
            </Link>
          </Button>
          <SectionTitle>Practice round</SectionTitle>
          <Bar className="mt-2 h-4 w-full max-w-md" />
          {saved ? (
            <div className="mt-8 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Bar key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="mt-8 max-w-sm space-y-5">
              <Bar className="h-14 w-full rounded-md" />
              <Bar className="h-12 w-full rounded-md" />
            </div>
          )}
        </div>
      </PageMain>
    </div>
  );
}

/**
 * `/interview/tutorial`: the Tutorial's first step, in outline (practice feedback ticket 06) — the run's
 * header with its caption written, and bars for the count, the clock, and the first pointer.
 */
function TutorialLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading the tutorial…</PageWait>

      <PageMain className="pt-4 sm:pt-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 h-8" />
          <p className="text-sm text-muted-foreground">Tutorial</p>
          <div className="mt-3 flex items-start justify-between gap-6">
            <Bar className="mt-2 h-4 w-40" />
            <Bar className="h-12 w-24 rounded-md" />
          </div>
          <Bar className="mt-6 h-28 w-full max-w-sm rounded-md sm:mt-12" />
        </div>
      </PageMain>
    </div>
  );
}

/**
 * `/interview/<job>/<attempt>`: a past interview's Scorecard, in outline (interview second pass ticket
 * 06). The way back is live, as on the page; the Job is named at once when the board already holds it;
 * the Scorecard's section titles are fixed words, so they are written.
 */
function PastInterviewLoading({ jobId }: { jobId: string }) {
  const job = useQueryClient()
    .getQueryData<Job[]>(jobsCache.key)
    ?.find((candidate) => candidate.id === jobId);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader leading={<BrandLogo href="/board" />} loading />
      <PageWait>Loading this interview…</PageWait>

      <PageMain>
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/interview">
              <ArrowLeft aria-hidden="true" />
              All interviews
            </Link>
          </Button>
          {job ? (
            <p aria-hidden="true" className="font-heading text-3xl tracking-tight text-balance">
              {job.role} at {job.company}
            </p>
          ) : (
            <Bar className="h-9 w-80 max-w-full" />
          )}
          <SectionLede>An interview you rehearsed, and how it went.</SectionLede>

          <div className="mt-8 space-y-6">
            <div className="space-y-2.5 rounded-lg bg-accent/70 p-5 ring-1 ring-primary/15">
              <p aria-hidden="true" className="text-sm font-medium text-muted-foreground">
                Overall
              </p>
              <Bar className="h-7 w-48" />
            </div>
            <Bar className="h-28 w-full rounded-lg" />
            <div>
              <p aria-hidden="true" className="text-lg font-medium">
                By area
              </p>
              <div className="mt-2 divide-y divide-border border-y border-border">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <Bar className="h-4 w-24" />
                    <Bar className="h-4 w-28" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p aria-hidden="true" className="text-lg font-medium">
                Answer by answer
              </p>
              <div className="mt-3 space-y-4">
                {[0, 1].map((i) => (
                  <GhostCard key={i}>
                    <GhostCardBody lines={3} />
                  </GhostCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageMain>
    </div>
  );
}

function OutlineStep({ title, last = false, children }: { title: string; last?: boolean; children?: React.ReactNode }) {
  return (
    <div className="relative flex gap-4 pb-8">
      {!last && <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-0.5 bg-border" />}
      <Bar className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 pt-0.5">
        <p aria-hidden="true" className="font-heading text-xl text-muted-foreground">
          {title}
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
