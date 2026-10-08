CREATE TABLE public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eligible_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  notification_evidence JSONB NOT NULL DEFAULT '[]',
  is_test_data BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX account_deletion_requests_user_id_requested_at_idx
  ON public.account_deletion_requests(user_id, requested_at);
CREATE INDEX account_deletion_requests_status_eligible_at_idx
  ON public.account_deletion_requests(status, eligible_at);
CREATE UNIQUE INDEX account_deletion_requests_active_user_idx
  ON public.account_deletion_requests(user_id)
  WHERE status IN ('requested', 'blocked', 'processing');
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM anon, authenticated;
