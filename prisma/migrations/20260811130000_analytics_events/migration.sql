-- Migration: vendor-acquisition analytics event log
-- Adds analytics_events table with RLS deny-all for client roles.
-- Writes are exclusively via the API service role (AnalyticsService.track),
-- which bypasses RLS. Direct anon/authenticated queries are blocked.

CREATE TABLE analytics_events (
  id              VARCHAR(30)   NOT NULL,
  event_name      VARCHAR(64)   NOT NULL,
  properties      JSONB         NOT NULL DEFAULT '{}',
  anon_visitor_id VARCHAR(128),
  vendor_id       UUID,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
);

CREATE INDEX analytics_events_event_name_created_at_idx
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX analytics_events_vendor_id_created_at_idx
  ON analytics_events (vendor_id, created_at DESC);

-- RLS: no direct client access. The API service role bypasses RLS.
-- anon = unauthenticated Supabase JS; authenticated = logged-in Supabase JS.
-- Neither should ever read or write analytics events directly.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_events_deny_all"
  ON analytics_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
