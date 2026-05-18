-- Anonymous search analytics. No user_id / IP - stays out of DSAR scope.

CREATE TABLE "search_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "query" VARCHAR(200) NOT NULL,
  "postcode" VARCHAR(10),
  "results_count" INTEGER NOT NULL,
  "searched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- Composite for "top queries in the last N days".
CREATE INDEX "search_logs_query_searched_at_idx"
  ON "search_logs"("query", "searched_at" DESC);

-- Plain time index for the date-range filter on the analytics endpoint.
CREATE INDEX "search_logs_searched_at_idx"
  ON "search_logs"("searched_at" DESC);
