-- CreateTable
CREATE TABLE "coverage_interests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "name" TEXT,
    "marketing_consent" BOOLEAN,
    "source" TEXT DEFAULT 'coverage-check',
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coverage_interests_postcode_idx" ON "coverage_interests"("postcode");

-- CreateIndex
CREATE INDEX "coverage_interests_email_idx" ON "coverage_interests"("email");

-- Deny-by-default RLS: the public POST /coverage-interest endpoint writes via
-- the API's privileged Postgres role (which bypasses RLS), while the Supabase
-- anon/authenticated keys shipped to the frontends get no direct PostgREST
-- access. Mirrors the invariant set in 20260513000000_enable_rls_all_tables.
ALTER TABLE "coverage_interests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coverage_interests" FORCE ROW LEVEL SECURITY;
