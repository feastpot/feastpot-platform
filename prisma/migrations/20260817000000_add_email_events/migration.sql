-- One row per Resend webhook delivery event.
-- svix_id is unique: the endpoint returns 200 immediately if the row already
-- exists, making the handler fully idempotent against Resend's at-least-once
-- delivery guarantee.

CREATE TABLE email_events (
  id          TEXT         NOT NULL,
  svix_id     VARCHAR(255) NOT NULL,
  event_type  VARCHAR(60)  NOT NULL,
  email_id    VARCHAR(255) NOT NULL,
  "to"        VARCHAR(320) NOT NULL,
  subject     VARCHAR(500),
  bounce_type VARCHAR(10),
  suppressed  BOOLEAN      NOT NULL DEFAULT false,
  raw_payload JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT email_events_pkey        PRIMARY KEY (id),
  CONSTRAINT email_events_svix_id_key UNIQUE (svix_id)
);

CREATE INDEX email_events_email_id_idx      ON email_events (email_id);
CREATE INDEX email_events_to_event_type_idx ON email_events ("to", event_type);
CREATE INDEX email_events_created_at_idx    ON email_events (created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
-- No public policies: service_role bypasses RLS; no customer-facing reads needed.
