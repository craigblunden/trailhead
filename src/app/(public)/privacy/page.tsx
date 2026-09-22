import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, PageTitle, Paragraph, Section, Subheading } from "@/components/public/prose";
import { BRAND_NAME } from "@/lib/brand";
import { AI_PROVIDERS, FILES_ARE_NEVER_SENT, TERMS_VERSION, WHAT_WE_DO_NOT_DO } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${BRAND_NAME} sends to which AI company, what each one commits to, and how long it is kept.`,
};

/**
 * `/privacy` (terms ticket 02) — the substantive page, and the user-facing half of what
 * `docs/architecture.md` says to developers. The two must not disagree.
 *
 * Both providers' no-training commitments are quoted rather than paraphrased, because a paraphrase of
 * a commitment reads as a disclaimer, and a disclaimer here would be **less accurate than the truth**.
 * The one thing genuinely unknown — TypeSafe publishes no retention period — is said as exactly that,
 * rather than fogging both companies to cover it.
 *
 * The page is dated because the Anthropic retention figure is a fact about how this deployment is
 * configured rather than a permanent truth, and retention floors differ by model.
 */
export default function PrivacyPage() {
  return (
    <>
      <PageTitle version={TERMS_VERSION}>Privacy</PageTitle>

      <Section id="the-short-version" heading="The short version">
        <Paragraph>
          {BRAND_NAME} sends some of your text to two AI companies, and to nobody else. Both of them
          have committed in writing not to train models on it. Neither of them ever receives a file
          you uploaded — only text. Nothing you keep here is sold, advertised against, or visible to
          another account.
        </Paragraph>
      </Section>

      <Section id="what-leaves" heading="What leaves this product, and where it goes">
        <Paragraph>{FILES_ARE_NEVER_SENT}</Paragraph>
        {AI_PROVIDERS.map((provider) => (
          <div key={provider.name}>
            <Subheading>{provider.name}</Subheading>
            <div className="mt-2 space-y-3">
              <Paragraph>
                <span className="text-foreground">Used for:</span> {provider.usedFor}
              </Paragraph>
              <Paragraph>What is sent:</Paragraph>
              <Bullets items={provider.sends} />
              <Paragraph>
                <span className="text-foreground">What is not sent:</span> your uploaded files, your
                email address, your name, your notes, your contacts, and anything about any other job.
              </Paragraph>
              <Paragraph>
                <span className="text-foreground">Training:</span> {provider.name} states, in their{" "}
                {provider.quoteSource}:
              </Paragraph>
              <blockquote className="border-l-2 border-primary/40 pl-4 leading-relaxed text-pretty">
                “{provider.quote}”
              </blockquote>
              {provider.name === "TypeSafe" && (
                <Paragraph>
                  The same policy adds that “we will not disclose any Input to a third party other
                  than our service providers”.
                </Paragraph>
              )}
              <Paragraph>
                <span className="text-foreground">How long they keep it:</span> {provider.retention}
              </Paragraph>
            </div>
          </div>
        ))}
        <Paragraph>
          Retention can differ by model: some models carry a floor that cannot be shortened, whatever
          an account is configured for. That is part of why this page is dated.
        </Paragraph>
      </Section>

      <Section id="what-we-hold" heading="What this product holds">
        <Paragraph>
          Your jobs, contacts, notes, drafts, interview attempts and footings live in a database where
          every row carries your account id, and every query runs under a database policy that
          compares that id to the account making the request. There is no shared or public record in
          this product for that policy to have an exception for.
        </Paragraph>
        <Paragraph>
          The files you upload live in a private bucket, under a path beginning with your account id,
          readable only through a short-lived link signed for you. Your password, if you use one, is
          held by the authentication service and never reaches this application.
        </Paragraph>
      </Section>

      <Section id="what-we-dont" heading="What this product does not do">
        <Bullets items={WHAT_WE_DO_NOT_DO} />
      </Section>

      <Section id="deleting" heading="Deleting everything">
        <Paragraph>
          Deleting your account erases its data at once and for good — jobs, contacts, documents and
          their files, drafts, quota weeks, plan, interview attempts, footings, and the record that
          you accepted the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            terms
          </Link>
          . There is no grace period and nothing to restore.
        </Paragraph>
        <Paragraph>
          What has already been sent to an AI company is theirs to expire under the retention above.
          Deleting your account here does not reach into their logs, and this page will not pretend
          otherwise.
        </Paragraph>
      </Section>
    </>
  );
}
