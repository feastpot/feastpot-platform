-- Migration: error_incidents table
-- Stores a real, searchable FP-XXXX-XXXX reference for every exception that
-- reaches an app error boundary. Support pastes the ref into admin to find
-- the incident; vendors never see a raw stack trace.

CREATE TABLE error_incidents (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  ref         VARCHAR(15)  NOT NULL UNIQUE,
  app         VARCHAR(20)  NOT NULL,
  route       VARCHAR(255) NOT NULL,
  message     TEXT         NOT NULL,
  digest      VARCHAR(50),
  vendor_id   UUID,
  user_id     UUID,
  user_agent  VARCHAR(500),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX error_incidents_created_at_idx
  ON error_incidents (created_at DESC);

CREATE INDEX error_incidents_app_route_idx
  ON error_incidents (app, route, created_at DESC);

-- RLS: only the service-role (API) can access this table.
-- anon and authenticated users are denied by default (no permissive policies).
ALTER TABLE error_incidents ENABLE ROW LEVEL SECURITY;
