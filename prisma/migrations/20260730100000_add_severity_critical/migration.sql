-- Add 'critical' to the Severity enum (disputes). Escalated disputes are now
-- marked critical rather than reusing 'high', so triage can tell "urgent by
-- nature" (high) apart from "escalated past SLA" (critical).
ALTER TYPE "Severity" ADD VALUE IF NOT EXISTS 'critical';
