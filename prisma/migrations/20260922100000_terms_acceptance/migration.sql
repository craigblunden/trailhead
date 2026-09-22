-- Terms acceptance (terms ticket 03, ADR-0008): one row per version an Account has agreed to.
--
-- Append-only by intent rather than by trigger: nothing in `src/server/data/terms.ts` updates or
-- deletes a row, and a second acceptance of a version it already holds is an upsert that changes
-- nothing. The primary key is the pair, so the same version can never be recorded twice.
--
-- NOT Supabase `user_metadata`: that is writable by the user it describes, so it cannot hold a record
-- about that same user. This is tenant data under the same forced RLS as every other table — the
-- Tenant may read and write only their own acceptances, and cannot reach anyone else's.

CREATE TABLE "TermsAcceptance" (
    "userId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("userId", "version")
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "TermsAcceptance" TO trailhead_app;

ALTER TABLE "TermsAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TermsAcceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TermsAcceptance"
  FOR ALL TO trailhead_app
  USING ("userId" = public.tenant_id())
  WITH CHECK ("userId" = public.tenant_id());

-- Account deletion (ADR-0004): `public.erase_my_account()` deletes as `postgres`, so it needs the
-- same SELECT and DELETE here as on every other tenant table. The function itself is updated in
-- supabase/migrations/20260922100000_erase_terms_acceptance.sql.
GRANT SELECT, DELETE ON "TermsAcceptance" TO postgres;
